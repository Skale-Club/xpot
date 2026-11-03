import type { Express, Request, Response, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db, pool } from "../db.js";
import { users } from "#shared/schema.js";
import { eq } from "drizzle-orm";
import { normalizeIpKey, rateLimit } from "../tags/rateLimit.js";

export async function setupSupabaseAuth(app: Express) {
  app.set("trust proxy", 1);

  // Session store — reuses the existing connection pool (SSL pre-configured).
  // Field reps live in the installed PWA, so the window is long and rolling:
  // every authenticated request pushes the expiry forward. A fixed 1-week window
  // logged everyone out every Monday regardless of daily use.
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
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
      // Re-issue the cookie (and touch the store row) on every response so an
      // active user's session never expires under them.
      rolling: true,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: sessionTtl,
      },
    })
  );

  // The Supabase-token exchange is retired. Google Cloud credentials use
  // /api/auth/identity; the application's own secure session cookie remains.
  app.post('/api/auth/login', (_req, res) => res.status(410).json({ code: 'passwordless_login_required' }));

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

  app.get('/api/supabase-config', (_req, res) => res.status(410).json({ code: 'supabase_auth_retired' }));
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  const sess = req.session as any;
  if (!sess?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};
