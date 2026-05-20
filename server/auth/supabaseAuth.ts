import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { db, pool } from "../db.js";
import { users } from "#shared/schema.js";
import { eq } from "drizzle-orm";

export async function setupSupabaseAuth(app: Express) {
  app.set("trust proxy", 1);

  // Session store — reuses the existing connection pool (SSL pre-configured).
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    pool: pool,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: sessionTtl,
      },
    })
  );

  // POST /api/auth/login
  // Accepts a Supabase access token from the client, verifies it server-side,
  // upserts the user row, and creates an Express session cookie.
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ message: "Access token required" });
      }

      const supabase = getSupabaseAdmin();
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(accessToken);

      if (error || !supabaseUser) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const email = supabaseUser.email;
      if (!email) {
        return res.status(400).json({ message: "Email not available from Supabase" });
      }

      let [dbUser] = await db.select().from(users).where(eq(users.email, email));

      if (!dbUser) {
        [dbUser] = await db
          .insert(users)
          .values({
            id: supabaseUser.id,
            email,
            firstName: supabaseUser.user_metadata?.first_name || null,
            lastName: supabaseUser.user_metadata?.last_name || null,
            profileImageUrl: supabaseUser.user_metadata?.avatar_url || null,
            isAdmin: false,
          })
          .onConflictDoUpdate({
            target: users.id,
            set: { email, updatedAt: new Date() },
          })
          .returning();
      }

      (req.session as any).userId = dbUser.id;
      (req.session as any).email = dbUser.email;
      (req.session as any).isAdmin = dbUser.isAdmin;
      (req.session as any).firstName = dbUser.firstName;
      (req.session as any).lastName = dbUser.lastName;

      res.json({
        isAdmin: dbUser.isAdmin || false,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
      });
    } catch (err) {
      console.error("Supabase login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/user", async (req: Request, res: Response) => {
    const sess = req.session as any;
    if (!sess?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const [dbUser] = await db.select().from(users).where(eq(users.id, sess.userId));
      if (!dbUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      res.json(dbUser);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Client config endpoint (Supabase project URL + anon key for the browser SDK)
  app.get("/api/supabase-config", (_req: Request, res: Response) => {
    res.json({
      url: process.env.SUPABASE_URL || "",
      anonKey: process.env.SUPABASE_ANON_KEY || "",
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  const sess = req.session as any;
  if (!sess?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};
