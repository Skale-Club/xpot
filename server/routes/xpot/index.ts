import type { Express } from "express";
import { createAuthRouter } from "./auth.js";
import { createDashboardRouter } from "./dashboard.js";
import { createMetricsRouter } from "./metrics.js";
import { createLeadsRouter } from "./leads.js";
import { createVisitsRouter } from "./visits.js";
import { createOpportunitiesRouter } from "./opportunities.js";
import { createTasksRouter } from "./tasks.js";
import { createSyncRouter } from "./sync.js";
import { createPlaceSearchRouter } from "./place-search.js";
import { createAdminRouter } from "./admin.js";

export function registerXpotRoutes(app: Express) {
  app.use("/api/xpot", createAuthRouter());
  app.use("/api/xpot", createDashboardRouter());
  app.use("/api/xpot", createMetricsRouter());
  app.use("/api/xpot", createLeadsRouter());
  app.use("/api/xpot", createVisitsRouter());
  app.use("/api/xpot", createOpportunitiesRouter());
  app.use("/api/xpot", createTasksRouter());
  app.use("/api/xpot", createSyncRouter());
  app.use("/api/xpot", createPlaceSearchRouter());
  app.use("/api/xpot", createAdminRouter());
}
