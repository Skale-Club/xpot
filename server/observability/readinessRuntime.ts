import pg from "pg";
import { databaseUrl, pool } from "../db.js";
import { createReadinessProbe } from "./readiness.js";

// A public probe cannot queue behind or consume the business pool. A single
// read-only slot, short deadlines, ten-second cache and single-flight bound work.
const healthPool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: pool.options.ssl,
  max: 1,
  connectionTimeoutMillis: 1500,
  query_timeout: 2000,
  statement_timeout: 2000,
  options: "-c default_transaction_read_only=on",
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
  keepAlive: true,
});
healthPool.on("error", () => { /* A dropped idle probe connection must not crash the app. */ });

export const getReadiness = createReadinessProbe(
  () => healthPool.query("SELECT 1"),
  () => process.env.SOURCE_COMMIT ?? null,
);
