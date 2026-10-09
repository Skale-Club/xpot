// npm run db:pull — refresh the local database with a copy of production.
// `npm run local` runs it on its own when the last pull is over 6 hours old.
//
// 1. Over SSH, find the xpot-db container's address and credentials. They stay
//    in memory; the database is never exposed to the internet.
// 2. Open a temporary SSH tunnel to it.
// 3. Save a JSON backup of the local database (../xpot-db-backups/).
// 4. Read production in one READ ONLY snapshot and replace the local data in
//    ONE transaction: any error leaves the local database untouched. Login
//    sessions, phone codes and the migration log stay local, so you stay signed in.
// 5. Close the tunnel.
//
// Settings in .env (none secret):
//   XPOT_PROD_SSH           ssh target of the Coolify server (e.g. root@coolify.skale.club)
//   XPOT_PROD_DB_CONTAINER  xpot-db's container name in Coolify (default below)

import "dotenv/config";
import { spawn, spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { createConnection } from "net";
import { join, resolve } from "path";
import pg from "pg";

const PROD_SSH = process.env.XPOT_PROD_SSH;
const PROD_CONTAINER = process.env.XPOT_PROD_DB_CONTAINER || "7l8mjbkk16mk0ss9dviw9lzj";
const LOCAL_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const TUNNEL_PORT = 55432;
const BACKUP_DIR = resolve(process.cwd(), "..", "xpot-db-backups");
/** When the last pull succeeded; `npm run local` reads it to pull at most every few hours. */
const PULL_STAMP = resolve(process.cwd(), ".cache", "db-pull.json");

/** Kept from the local database: your sign-in survives the pull. */
const KEEP_LOCAL = new Set(["sessions", "auth_phone_codes", "_xpot_migrations"]);

function fail(message: string): never {
  throw new Error(message);
}

function connect(url: string, ssl: boolean) {
  return new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, (m) => (m.startsWith("?") ? "?" : "")),
    ssl: ssl ? { rejectUnauthorized: false } : false,
  });
}

function ssh(remote: string, what: string) {
  const r = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", PROD_SSH!, remote], { encoding: "utf8" });
  if (r.status !== 0) fail(`${what}: ${(r.stderr || "").trim().split("\n").pop() || `ssh exited with ${r.status}`}`);
  return r.stdout;
}

/** The container's private address and its Postgres credentials, read on the server. */
function productionTarget() {
  const ip = ssh(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' ${PROD_CONTAINER}`, "finding xpot-db")
    .trim()
    .split(/\s+/)[0];
  if (!ip) fail(`container ${PROD_CONTAINER} has no network address`);
  // Single quotes: the variables expand inside the container, not on this machine.
  const [user, password, db] = ssh(`docker exec ${PROD_CONTAINER} sh -c 'printf "%s\\n%s\\n%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB"'`, "reading xpot-db settings").split("\n");
  if (!user || !db) fail("could not read xpot-db's user and database");
  return { ip, url: `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password ?? "")}@127.0.0.1:${TUNNEL_PORT}/${encodeURIComponent(db)}` };
}

async function openTunnel(ip: string) {
  const tunnel = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-N", "-L", `127.0.0.1:${TUNNEL_PORT}:${ip}:5432`, PROD_SSH!], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    if (tunnel.exitCode !== null) fail(`ssh tunnel closed (port ${TUNNEL_PORT} busy?)`);
    const open = await new Promise<boolean>((done) => {
      const sock = createConnection(TUNNEL_PORT, "127.0.0.1");
      sock.once("connect", () => (sock.destroy(), done(true)));
      sock.once("error", () => done(false));
    });
    if (open) return tunnel;
    await new Promise((r) => setTimeout(r, 250));
  }
  tunnel.kill();
  fail("ssh tunnel did not open");
}

async function tableNames(c: pg.Client) {
  const { rows } = await c.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1");
  return rows.map((r) => r.table_name as string);
}

async function backupLocal(local: pg.Client) {
  const dump: Record<string, unknown[]> = {};
  for (const t of await tableNames(local)) dump[t] = (await local.query(`select * from "${t}"`)).rows;
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `local-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), tables: dump }));
  console.log(`✓ local backup ${file}`);
}

/** Parents before children, following foreign keys. */
async function fkOrder(c: pg.Client, names: string[]) {
  const { rows } = await c.query(`
    select tc.table_name child, ccu.table_name parent
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`);
  const deps = new Map(names.map((n) => [n, new Set<string>()]));
  for (const { child, parent } of rows) if (deps.has(child) && deps.has(parent) && child !== parent) deps.get(child)!.add(parent);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (n: string, stack = new Set<string>()) => {
    if (seen.has(n)) return;
    if (stack.has(n)) fail(`foreign key cycle at ${n}`);
    stack.add(n);
    for (const p of Array.from(deps.get(n)!)) visit(p, stack);
    stack.delete(n);
    seen.add(n);
    order.push(n);
  };
  names.forEach((n) => visit(n));
  return order;
}

async function copy(prod: pg.Client, local: pg.Client) {
  const prodTables = new Set(await tableNames(prod));
  const tables = (await tableNames(local)).filter((t) => prodTables.has(t) && !KEEP_LOCAL.has(t));
  const order = await fkOrder(local, tables);
  const colsOf = async (c: pg.Client, t: string) =>
    (await c.query("select column_name, data_type, is_generated, identity_generation from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position", [t])).rows;

  await local.query("BEGIN");
  try {
    await local.query(`TRUNCATE ${order.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    const counts: string[] = [];
    for (const t of order) {
      const localCols = await colsOf(local, t);
      const prodCols = new Set((await colsOf(prod, t)).map((r) => r.column_name));
      const cols = localCols.filter((r) => prodCols.has(r.column_name) && r.is_generated !== "ALWAYS").map((r) => r.column_name as string);
      // json/jsonb go in as text; Postgres arrays (text[] ...) go in as JS arrays.
      const jsonCols = new Set(localCols.filter((r) => r.data_type === "json" || r.data_type === "jsonb").map((r) => r.column_name as string));
      const identity = localCols.some((r) => r.identity_generation === "ALWAYS");
      const { rows } = await prod.query(`select ${cols.map((x) => `"${x}"`).join(",")} from "${t}"`);
      for (let i = 0; i < rows.length; i += 200) {
        const values: unknown[] = [];
        const tuples = rows.slice(i, i + 200).map((row) => `(${cols.map((col) => {
          let v = row[col];
          if (v !== null && jsonCols.has(col)) v = JSON.stringify(v);
          values.push(v);
          return `$${values.length}`;
        }).join(",")})`);
        await local.query(`INSERT INTO "${t}" (${cols.map((x) => `"${x}"`).join(",")}) ${identity ? "OVERRIDING SYSTEM VALUE " : ""}VALUES ${tuples.join(",")}`, values);
      }
      if (rows.length) counts.push(`${t}=${rows.length}`);
    }
    // Serial counters continue after the copied ids.
    const { rows: seqs } = await local.query(`
      select c.table_name, c.column_name, pg_get_serial_sequence(format('%I', c.table_name), c.column_name) seq
      from information_schema.columns c
      where c.table_schema = 'public' and pg_get_serial_sequence(format('%I', c.table_name), c.column_name) is not null`);
    for (const { table_name, column_name, seq } of seqs) {
      if (!order.includes(table_name)) continue;
      await local.query(`select setval($1, coalesce((select max("${column_name}") from "${table_name}"), 0) + 1, false)`, [seq]);
    }
    await local.query("COMMIT");
    console.log(`✓ copied ${counts.join(" ")}`);
  } catch (e) {
    await local.query("ROLLBACK").catch(() => undefined);
    fail(`copy rolled back, local database unchanged: ${(e as Error).message}`);
  }
}

async function main() {
  if (!PROD_SSH) fail("set XPOT_PROD_SSH in .env (the ssh target of the Coolify server)");
  if (!LOCAL_URL) fail("DATABASE_URL or POSTGRES_URL must be set");
  // The local database is the dev one on Supabase; never overwrite anything else.
  const localHost = new URL(LOCAL_URL).hostname;
  if (!localHost.includes(".supabase.")) fail(`refusing: the local database (${localHost}) is not the Supabase dev database`);

  console.log(`→ connecting to production through ${PROD_SSH} ...`);
  const target = productionTarget();
  const tunnel = await openTunnel(target.ip);
  const prod = connect(target.url, false);
  const local = connect(LOCAL_URL, true);
  try {
    await prod.connect();
    await local.connect();
    // One consistent, read-only view of production for the whole copy.
    await prod.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await backupLocal(local);
    await copy(prod, local);
    await prod.query("COMMIT");
    mkdirSync(resolve(PULL_STAMP, ".."), { recursive: true });
    writeFileSync(PULL_STAMP, JSON.stringify({ pulledAt: new Date().toISOString() }));
    console.log("✓ done: localhost now shows production data (a snapshot; npm run local refreshes it every 6 hours)");
  } finally {
    await prod.end().catch(() => undefined);
    await local.end().catch(() => undefined);
    tunnel.kill();
  }
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
