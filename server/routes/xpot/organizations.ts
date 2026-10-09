import { Router } from "express";
import { z } from "zod";
import { managesEveryOrganization } from "#shared/organizations.js";
import { XPOT_MODULES } from "#shared/modules.js";
import { requireXpotUser, type XpotActor } from "./middleware.js";
import { AccountError, createResellerAccount, resellerAccountSchema } from "./resellerAccounts.js";
import {
  OrganizationError,
  addOrganizationMember,
  assertOrganizationAccess,
  createOrganization,
  getOrganizationWorkspace,
  listOrganizationCustomers,
  listOrganizationInventory,
  listOrganizationKits,
  listOrganizationMembers,
  listOrganizations,
  membershipsForRep,
  removeOrganizationMember,
  updateOrganization,
  updateOrganizationMember,
  type OrganizationActor,
} from "../../organizations/service.js";
import { deliverKit } from "../../tags/repository.js";

const id = z.coerce.number().int().positive();
const membershipRole = z.enum(["admin", "member"]);

function actorOf(req: any): OrganizationActor {
  return req.xpotActor as XpotActor;
}

function route(handler: (req: any) => Promise<unknown>, status = 200) {
  return async (req: any, res: any) => {
    try {
      res.status(status).json(await handler(req));
    } catch (error) {
      if (error instanceof OrganizationError || error instanceof AccountError) {
        return res.status(error.status).json({ message: error.message });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0]?.message ?? "Invalid input" });
      }
      console.error(`[organizations] ${req.method} ${req.path}`, error);
      res.status(500).json({ message: "Failed to manage Organization" });
    }
  };
}

async function assertRepAdminMayChange(actor: OrganizationActor, organizationId: number, repId: number, nextRole?: "admin" | "member") {
  if (managesEveryOrganization(actor)) return;
  if (actor.rep.id === repId) throw new OrganizationError("You cannot change your own Organization access.", 400);
  if (nextRole === "admin") throw new OrganizationError("Only an Admin or Manager can assign Rep Admin access.", 403);
  const members = await listOrganizationMembers(organizationId, actor);
  const target = members.find((member) => member.repId === repId);
  if (target?.membershipRole === "admin") {
    throw new OrganizationError("Only an Admin or Manager can change a Rep Admin.", 403);
  }
}

export function createOrganizationsRouter() {
  const router = Router();
  router.use("/organizations", requireXpotUser);

  router.get("/organizations", route((req) => listOrganizations(actorOf(req))));

  router.post("/organizations", route((req) => {
    const input = z.object({
      name: z.string().trim().min(2).max(120),
      repAdminId: z.number().int().positive(),
    }).strict().parse(req.body);
    return createOrganization(input, actorOf(req));
  }, 201));

  router.get("/organizations/:organizationId", route((req) =>
    getOrganizationWorkspace(id.parse(req.params.organizationId), actorOf(req))));

  router.patch("/organizations/:organizationId", route((req) => {
    const input = z.object({
      name: z.string().trim().min(2).max(120).optional(),
      isActive: z.boolean().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "No changes supplied").parse(req.body);
    return updateOrganization(id.parse(req.params.organizationId), input, actorOf(req));
  }));

  router.get("/organizations/:organizationId/members", route((req) =>
    listOrganizationMembers(id.parse(req.params.organizationId), actorOf(req))));

  router.post("/organizations/:organizationId/members", route(async (req) => {
    const organizationId = id.parse(req.params.organizationId);
    const actor = actorOf(req);
    await assertOrganizationAccess(actor, organizationId, true);
    const existing = z.object({
      repId: z.number().int().positive(),
      membershipRole: membershipRole.default("member"),
    }).strict().safeParse(req.body);
    if (existing.success) {
      if (!managesEveryOrganization(actor) && existing.data.membershipRole === "admin") {
        throw new OrganizationError("Only an Admin or Manager can assign Rep Admin access.", 403);
      }
      return addOrganizationMember(organizationId, existing.data.repId, existing.data.membershipRole, actor);
    }

    const created = resellerAccountSchema.extend({
      role: z.literal("rep").default("rep"),
      modules: z.array(z.enum(XPOT_MODULES)).min(1).default([...XPOT_MODULES]),
      membershipRole: membershipRole.default("member"),
    }).strict().parse(req.body);
    if (!managesEveryOrganization(actor) && created.membershipRole === "admin") {
      throw new OrganizationError("Only an Admin or Manager can assign Rep Admin access.", 403);
    }
    const { membershipRole: role, ...account } = created;
    const rep = await createResellerAccount(account, { userId: actor.user.userId, isAdmin: actor.user.isAdmin });
    return addOrganizationMember(organizationId, rep.id, role, actor);
  }, 201));

  router.patch("/organizations/:organizationId/members/:repId", route(async (req) => {
    const organizationId = id.parse(req.params.organizationId);
    const repId = id.parse(req.params.repId);
    const input = z.object({
      role: membershipRole.optional(),
      isActive: z.boolean().optional(),
      blockedReason: z.string().trim().max(300).nullable().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "No changes supplied").parse(req.body);
    const actor = actorOf(req);
    await assertRepAdminMayChange(actor, organizationId, repId, input.role);
    return updateOrganizationMember(organizationId, repId, input, actor);
  }));

  router.delete("/organizations/:organizationId/members/:repId", route(async (req) => {
    const organizationId = id.parse(req.params.organizationId);
    const repId = id.parse(req.params.repId);
    const actor = actorOf(req);
    await assertRepAdminMayChange(actor, organizationId, repId);
    return removeOrganizationMember(organizationId, repId, actor);
  }));

  router.get("/organizations/:organizationId/inventory", route((req) =>
    listOrganizationInventory(id.parse(req.params.organizationId), actorOf(req))));
  router.get("/organizations/:organizationId/kits", route((req) =>
    listOrganizationKits(id.parse(req.params.organizationId), actorOf(req))));
  router.post("/organizations/:organizationId/kits", route(async (req) => {
    const organizationId = id.parse(req.params.organizationId);
    const actor = actorOf(req);
    await assertOrganizationAccess(actor, organizationId, true);
    const input = z.object({
      repId: z.number().int().positive(),
      codes: z.array(z.string().trim().min(1)).min(1).optional(),
      batchId: z.string().uuid().optional(),
      quantity: z.number().int().positive().max(500).optional(),
      note: z.string().trim().max(300).nullable().optional(),
      unitCostCents: z.number().int().min(0).optional(),
    }).strict().parse(req.body);
    const members = await listOrganizationMembers(organizationId, actor);
    const target = members.find((member) => member.repId === input.repId && member.isActive && !member.blockedAt);
    if (!target) throw new OrganizationError("The target Rep is not active in this Organization.", 400);
    return deliverKit({
      ...input,
      organizationId,
      sourceOrganizationId: managesEveryOrganization(actor) ? undefined : organizationId,
    }, actor.user.userId);
  }, 201));
  router.get("/organizations/:organizationId/customers", route((req) =>
    listOrganizationCustomers(id.parse(req.params.organizationId), actorOf(req))));

  router.get("/organizations/me/memberships", route((req) => membershipsForRep(actorOf(req).rep.id)));

  return router;
}
