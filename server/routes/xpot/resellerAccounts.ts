import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db.js";
import { users } from "#shared/schema.js";
import { XPOT_MODULES } from "#shared/modules.js";
import { storage } from "../../storage.js";
import { getSupabaseAdmin } from "../../lib/supabase.js";

// Resellers don't sign themselves up: the admin creates their login (email +
// password, shared over WhatsApp) and picks which modules they get. The login
// lives in Supabase Auth; the users row and the active rep are created here so
// the first sign-in lands straight in the app.

export const resellerAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "Password must have at least 8 characters").max(72),
  displayName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional().nullable(),
  team: z.string().trim().max(60).optional().nullable(),
  role: z.enum(["rep", "manager", "admin"]).default("rep"),
  modules: z.array(z.enum(XPOT_MODULES)).min(1).default([...XPOT_MODULES]),
}).strict();

export type ResellerAccountInput = z.infer<typeof resellerAccountSchema>;

export class AccountError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AuthAdmin {
  createUser(email: string, password: string, metadata: Record<string, string>): Promise<{ id: string }>;
  setPassword(userId: string, password: string): Promise<void>;
}

/** Supabase Auth admin API (service role). */
export function supabaseAuthAdmin(): AuthAdmin {
  return {
    async createUser(email, password, metadata) {
      const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error || !data.user) {
        const taken = /already|registered|exists/i.test(error?.message ?? "");
        throw new AccountError(taken ? "This email already has a login." : error?.message || "Could not create the login", taken ? 409 : 502);
      }
      return { id: data.user.id };
    },
    async setPassword(userId, password) {
      const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId, { password });
      if (error) throw new AccountError(error.message || "Could not change the password", 502);
    },
  };
}

function splitName(displayName: string): { firstName: string; lastName: string | null } {
  const [first, ...rest] = displayName.split(/\s+/);
  return { firstName: first, lastName: rest.length ? rest.join(" ") : null };
}

/**
 * Creates the login, the users row and an active rep. Only a global admin may
 * create another admin.
 */
export async function createResellerAccount(input: ResellerAccountInput, actorIsAdmin: boolean, auth: AuthAdmin = supabaseAuthAdmin()) {
  if (input.role === "admin" && !actorIsAdmin) throw new AccountError("Only an admin can create another admin.", 403);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) throw new AccountError("This email already has an account. Find it in the list below and turn it on.", 409);

  const { firstName, lastName } = splitName(input.displayName);
  const authUser = await auth.createUser(input.email, input.password, { first_name: firstName, last_name: lastName ?? "" });

  await db.insert(users).values({ id: authUser.id, email: input.email, firstName, lastName, isAdmin: input.role === "admin" });
  return storage.upsertSalesRep({
    userId: authUser.id,
    displayName: input.displayName,
    email: input.email,
    phone: input.phone ?? null,
    team: input.team ?? null,
    role: input.role,
    isActive: true,
    modules: input.modules,
  });
}

export const passwordResetSchema = z.object({
  password: resellerAccountSchema.shape.password,
}).strict();

/** The admin sets a new password for a rep (e.g. a reseller who forgot theirs). */
export async function resetRepPassword(repId: number, password: string, actorIsAdmin: boolean, auth: AuthAdmin = supabaseAuthAdmin()) {
  const rep = await storage.getSalesRep(repId);
  if (!rep?.userId) throw new AccountError("Rep not found", 404);
  if (rep.role === "admin" && !actorIsAdmin) throw new AccountError("Only an admin can change an admin's password.", 403);
  await auth.setPassword(rep.userId, password);
}
