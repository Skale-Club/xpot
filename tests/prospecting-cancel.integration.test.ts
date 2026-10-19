// A stuck prospecting search can be cancelled (BACKLOG UXR-20): by the rep who
// owns it from the Route screen, or by the Xpot admin from Status. Its waiting
// and running searches stop, the worker never sends or saves them again, and
// the route is marked failed so the rep can start over or rebuild it.

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));
const engine = vi.hoisted(() => ({
  startEngineJob: null as any,
  getEngineJobStatus: null as any,
  downloadEngineCsv: null as any,
}));

vi.mock("../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  const directory = join(process.cwd(), "migrations");
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(directory, file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

// The engine is a fake: configured, and every call is recorded.
vi.mock("../server/prospecting/google-maps-engine.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/prospecting/google-maps-engine.js")>();
  engine.startEngineJob = vi.fn(async () => "engine-new");
  engine.getEngineJobStatus = vi.fn(async () => ({ status: "running", progress: 50 }));
  engine.downloadEngineCsv = vi.fn(async () => "");
  return {
    ...original,
    isEngineConfigured: () => true,
    startEngineJob: engine.startEngineJob,
    getEngineJobStatus: engine.getEngineJobStatus,
    downloadEngineCsv: engine.downloadEngineCsv,
    countEngineResultsSoFar: vi.fn(async () => null),
  };
});

const { createProspectingRouter } = await import("../server/routes/xpot/prospecting.js");
const { createSystemHealthRouter } = await import("../server/routes/xpot/system-health.js");
const { cancelProspectingJob, tickProspectingQueueSafely } = await import("../server/prospecting/queue.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

function app(userId: string, isAdmin: boolean) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: userId, isAdmin };
    next();
  });
  server.use("/api/xpot", createProspectingRouter());
  server.use("/api/xpot", createSystemHealthRouter());
  return server;
}

async function request(method: string, path: string, options: { as?: string; admin?: boolean; body?: unknown } = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app(options.as ?? "cancel-rep", options.admin ?? false).listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: options.body ? { "Content-Type": "application/json" } : undefined,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const text = await response.text();
        resolve({ status: response.status, body: text ? JSON.parse(text) : null });
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

let repId: number;
let otherRepId: number;

beforeEach(async () => {
  await q(`TRUNCATE prospecting_route_stops, prospecting_routes, prospecting_candidates, prospecting_runs, prospecting_jobs,
    organization_memberships, organizations, sales_reps, users RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('cancel-rep', '+15550000301', 'Cleo'), ('other-rep', '+15550000302', 'Otto'), ('cancel-admin', '+15550000303', 'Ada')`);
  repId = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('cancel-rep', 'Cleo Rep', 'rep', true) RETURNING id`)).id;
  otherRepId = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('other-rep', 'Otto Rep', 'rep', true) RETURNING id`)).id;
  await q(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('cancel-admin', 'Ada Admin', 'admin', true)`);
  const organizationId = (await one(`INSERT INTO organizations (name, slug) VALUES ('Cancel Team', 'cancel-team') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member')`, [organizationId, repId, otherRepId]);
  engine.startEngineJob.mockClear();
  engine.getEngineJobStatus.mockClear();
  engine.downloadEngineCsv.mockClear();
});

/** A search with one engine search running and one waiting behind it. */
async function runningJob(owner = repId) {
  const today = new Date().toISOString().slice(0, 10);
  const jobId = (await one(`INSERT INTO prospecting_jobs (rep_id, status, location, filters, started_at)
    VALUES ($1, 'running', 'Framingham, MA', $2::jsonb, NOW()) RETURNING id`, [owner, JSON.stringify({ routeDate: today })])).id as number;
  await q(`INSERT INTO prospecting_runs (job_id, rep_id, status, niche, query, location, engine_job_id, started_at, progress)
    VALUES ($1, $2, 'running', 'barbershop', 'barber shop', 'Framingham, MA', 'engine-1', NOW(), 50),
           ($1, $2, 'queued', 'salon', 'hair salon', 'Framingham, MA', NULL, NULL, 0)`, [jobId, owner]);
  return jobId;
}

const runsOf = async (jobId: number) => q(`SELECT status, error_message FROM prospecting_runs WHERE job_id = $1 ORDER BY id`, [jobId]);
const jobOf = async (jobId: number) => one(`SELECT status, route_planning_status, route_error_message, completed_at FROM prospecting_jobs WHERE id = $1`, [jobId]);

describe("the rep cancels their own search", () => {
  it("stops its running and waiting searches and frees the day", async () => {
    const jobId = await runningJob();
    const res = await request("POST", `/api/xpot/prospecting/jobs/${jobId}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ id: jobId, status: "cancelled", routePlanningStatus: "failed" });
    expect((await runsOf(jobId)).map((run) => run.status)).toEqual(["cancelled", "cancelled"]);
    expect((await jobOf(jobId)).completed_at).not.toBeNull();

    // Cancelling twice, or a finished search, is refused with a code the screen words.
    const again = await request("POST", `/api/xpot/prospecting/jobs/${jobId}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("search_not_cancellable");
    // A cancelled search is not brought back by "Try again".
    await q(`UPDATE prospecting_runs SET status = 'failed' WHERE job_id = $1 AND niche = 'salon'`, [jobId]);
    expect((await request("POST", `/api/xpot/prospecting/jobs/${jobId}/retry`)).status).toBe(409);
    expect((await jobOf(jobId)).status).toBe("cancelled");
  });

  it("lets the rep start a new search the same day", async () => {
    const jobId = await runningJob();
    const body = {
      location: "Natick, MA",
      routeDate: new Date().toISOString().slice(0, 10),
      searches: [{ niche: "barbershop", query: "barber shop" }],
      shiftDurationMinutes: 240,
    };
    expect((await request("POST", "/api/xpot/prospecting/jobs", { body })).status).toBe(409);
    expect((await request("POST", `/api/xpot/prospecting/jobs/${jobId}/cancel`)).status).toBe(200);
    const created = await request("POST", "/api/xpot/prospecting/jobs", { body });
    expect(created.status).toBeLessThan(300);
    expect(created.body.job).toMatchObject({ status: "queued", location: "Natick, MA" });
  });

  it("cannot reach another person's search", async () => {
    const jobId = await runningJob(otherRepId);
    expect((await request("POST", `/api/xpot/prospecting/jobs/${jobId}/cancel`)).status).toBe(404);
    expect((await jobOf(jobId)).status).toBe("running");
  });

  it("releases a finished search whose route got stuck building, so it can be built again", async () => {
    const jobId = (await one(`INSERT INTO prospecting_jobs (rep_id, status, location, route_planning_status, completed_at)
      VALUES ($1, 'completed', 'Natick, MA', 'building', NOW()) RETURNING id`, [repId])).id as number;
    const res = await request("POST", `/api/xpot/prospecting/jobs/${jobId}/cancel`);
    expect(res.status).toBe(200);
    expect(await jobOf(jobId)).toMatchObject({ status: "completed", route_planning_status: "failed", route_error_message: "Route planning was cancelled." });
    expect((await request("POST", `/api/xpot/prospecting/jobs/${jobId}/route/retry`)).status).toBe(202);
  });
});

describe("the worker leaves a cancelled search alone", () => {
  it("neither polls its engine search nor sends the waiting one", async () => {
    const jobId = await runningJob();
    await cancelProspectingJob(jobId, repId);
    await tickProspectingQueueSafely();
    await tickProspectingQueueSafely();
    expect(engine.getEngineJobStatus).not.toHaveBeenCalled();
    expect(engine.startEngineJob).not.toHaveBeenCalled();
    expect((await runsOf(jobId)).map((run) => run.status)).toEqual(["cancelled", "cancelled"]);
    expect((await jobOf(jobId)).status).toBe("cancelled");
  });

  it("drops results that arrive after the cancel", async () => {
    const jobId = await runningJob();
    engine.getEngineJobStatus.mockResolvedValueOnce({ status: "completed", progress: 100 });
    // The search is cancelled while its results download.
    engine.downloadEngineCsv.mockImplementationOnce(async () => {
      await cancelProspectingJob(jobId);
      return "title,place_id,latitude,longitude\nNew Barber,place-1,42.3,-71.5\n";
    });
    await tickProspectingQueueSafely();
    expect(engine.downloadEngineCsv).toHaveBeenCalledTimes(1);
    expect((await one(`SELECT count(*)::int AS n FROM prospecting_candidates WHERE job_id = $1`, [jobId])).n).toBe(0);
    expect((await runsOf(jobId))[0].status).toBe("cancelled");
    expect((await jobOf(jobId)).status).toBe("cancelled");
  });

  it("does not send a search added to a job that was cancelled meanwhile", async () => {
    const jobId = await runningJob();
    await cancelProspectingJob(jobId);
    // An expansion wave written just as the job was cancelled.
    await q(`INSERT INTO prospecting_runs (job_id, rep_id, status, niche, query, location, wave)
      VALUES ($1, $2, 'queued', 'barbershop', 'barber shop', 'Natick, MA', 1)`, [jobId, repId]);
    await tickProspectingQueueSafely();
    expect(engine.startEngineJob).not.toHaveBeenCalled();
    expect((await runsOf(jobId)).every((run) => run.status === "cancelled")).toBe(true);
  });

  it("sends the next person's search once the cancelled one frees the engine", async () => {
    const jobId = await runningJob();
    const otherJob = (await one(`INSERT INTO prospecting_jobs (rep_id, status, location) VALUES ($1, 'queued', 'Natick, MA') RETURNING id`, [otherRepId])).id;
    await q(`INSERT INTO prospecting_runs (job_id, rep_id, status, niche, query, location) VALUES ($1, $2, 'queued', 'salon', 'hair salon', 'Natick, MA')`, [otherJob, otherRepId]);
    await cancelProspectingJob(jobId);
    await tickProspectingQueueSafely();
    expect(engine.startEngineJob).toHaveBeenCalledTimes(1);
    expect((await one(`SELECT status FROM prospecting_runs WHERE job_id = $1`, [otherJob])).status).toBe("running");
  });
});

describe("Status cancels any person's search", () => {
  it("is for the Xpot admin, for whoever owns the search", async () => {
    const jobId = await runningJob(otherRepId);
    expect((await request("POST", `/api/xpot/admin/system-health/jobs/${jobId}/cancel`)).status).toBe(403);
    const res = await request("POST", `/api/xpot/admin/system-health/jobs/${jobId}/cancel`, { as: "cancel-admin", admin: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobId, status: "cancelled", routePlanningStatus: "failed", cancelledRuns: 2 });
    expect((await request("POST", `/api/xpot/admin/system-health/jobs/${jobId}/cancel`, { as: "cancel-admin", admin: true })).status).toBe(409);
    expect((await request("POST", `/api/xpot/admin/system-health/jobs/999999/cancel`, { as: "cancel-admin", admin: true })).status).toBe(404);
  });

  it("does not count a cancelled search as a failed route", async () => {
    const { systemHealthSnapshot } = await import("../server/observability/health.js");
    const jobId = await runningJob();
    await cancelProspectingJob(jobId);
    const snapshot = await systemHealthSnapshot();
    expect(snapshot.queue.failedRoutes24h).toBe(0);
    expect(snapshot.queue.activeRuns).toEqual([]);
  });
});
