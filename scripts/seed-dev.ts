// npm run db:seed:dev — wipe Xpot's business data in the DEVELOPMENT database and
// recreate a fake dataset that covers every type, status and edge case.
//
// Rules (owner decision 2026-11-07): development holds fake data only; the
// truth lives in production (xpot-db). Production is never copied here by
// default (`npm run db:pull` is for emergencies).
//
//   npm run db:seed:dev             back up, wipe, seed, commit
//   npm run db:seed:dev -- --dry-run  do everything, then roll back
//
// What it keeps: users and sessions (shared; demo users are upserted by id),
// the migration log, app branding, landing content, MCP clients/tokens, the
// product catalog (sales_products, price tiers) and the print-model catalog.
// What it switches OFF in development: Twilio SMS, Google Places, Xphere sync
// and the AI chat providers — nothing real leaves a dev machine.
//
// Sign in as any demo person with the phone number below: in development the
// code is shown on screen (devCode), no SMS is sent.

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import pg from "pg";
import { describeDatabaseTarget } from "../server/lib/database-target.js";
import { isXpotDataTable } from "./db-pull-schema.js";
import { seedDatabaseUrl } from "./seed-dev-guard.js";

type Row = Record<string, unknown>;

const DRY_RUN = process.argv.includes("--dry-run");
const BACKUP_DIR = resolve(process.cwd(), "..", "xpot-db-backups");

/** Kept as they are: configuration and catalogs, not business data. */
const KEEP = new Set([
  "app_branding",
  "landing_page_contents",
  "xphere_integrations",
  "sales_app_settings",
  "sales_products",
  "sales_product_price_tiers",
  "print_models",
  "print_model_versions",
  "organizations", // only the company row (xpot-company) survives; see wipe()
]);

// ---------------------------------------------------------------- time helpers
const NOW = new Date();
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const hours = (n: number) => minutes(n * 60);
const days = (n: number) => hours(n * 24);
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------- value lists
const PRODUCT_TYPES = [
  "large_stand", "small_stand", "large_sign", "small_sign", "large_plate", "small_plate",
  "google_review_sign", "business_card", "keychain", "safety_tag", "menu_tag", "booking_tag", "custom",
] as const;
const FACES = [
  "google_review", "instagram", "tiktok", "facebook", "website", "menu", "wifi", "whatsapp", "yelp", "venmo",
  "cashapp", "paypal", "zelle", "youtube", "linkedin", "phone", "email", "booking", "vcard", "custom",
] as const;
const NFC = ["not_programmed", "programmed", "verified", "locked", "failed"] as const;
const DESTINATIONS: Array<[string, string]> = [
  ["google_review", "https://g.page/r/demo-review"],
  ["website", "https://demo-cafe.example.com"],
  ["booking", "https://demo-salon.example.com/book"],
  ["vcard", "https://demo.example.com/vcard/ana"],
  ["menu", "https://demo-pizza.example.com/menu"],
  ["social", "https://instagram.com/demo.example"],
  ["custom", "https://demo.example.com/promo"],
];
/** BOS-area points (fake businesses on real streets would be confusing: every address is "Demo"). */
const BASE = { lat: 42.3554, lng: -71.0605 };
const point = (i: number) => ({
  lat: (BASE.lat + ((i * 37) % 50) / 1000 - 0.025).toFixed(6),
  lng: (BASE.lng + ((i * 53) % 50) / 1000 - 0.025).toFixed(6),
});
/** 8-char public codes in the Crockford alphabet the app uses (no I, L, O, U). */
const code = (i: number) => `XD${String(i).padStart(6, "0")}`;

// ---------------------------------------------------------------- db helpers
class Db {
  readonly counts = new Map<string, number>();
  private json = new Map<string, Set<string>>();
  constructor(readonly c: pg.Client) {}

  async loadColumnTypes() {
    const { rows } = await this.c.query(
      `select table_name, column_name from information_schema.columns
       where table_schema='public' and data_type in ('json','jsonb')`,
    );
    for (const r of rows) {
      if (!this.json.has(r.table_name)) this.json.set(r.table_name, new Set());
      this.json.get(r.table_name)!.add(r.column_name);
    }
  }

  /**
   * INSERT one row; json/jsonb values are serialized, Postgres arrays go in as JS arrays.
   * null and undefined mean "no value": the column keeps its default (NULL for most).
   */
  async insert(table: string, row: Row): Promise<Row> {
    const keys = Object.keys(row).filter((k) => row[k] !== undefined && row[k] !== null);
    const jsonCols = this.json.get(table) ?? new Set<string>();
    const values = keys.map((k) => (row[k] !== null && jsonCols.has(k) ? JSON.stringify(row[k]) : row[k]));
    const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys
      .map((_, i) => `$${i + 1}`)
      .join(",")}) RETURNING *`;
    try {
      const { rows } = await this.c.query(sql, values);
      this.counts.set(table, (this.counts.get(table) ?? 0) + 1);
      return rows[0];
    } catch (error) {
      throw new Error(`insert into ${table} failed: ${(error as Error).message}\nrow: ${JSON.stringify(row)}`);
    }
  }

  async one(sql: string, params: unknown[] = []) {
    return (await this.c.query(sql, params)).rows[0];
  }
}

async function tableNames(c: pg.Client) {
  const { rows } = await c.query(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1",
  );
  return rows.map((r) => r.table_name as string);
}

async function backup(c: pg.Client) {
  const dump: Record<string, unknown[]> = {};
  for (const t of await tableNames(c)) dump[t] = (await c.query(`select * from "${t}"`)).rows;
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `dev-before-seed-${NOW.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ takenAt: NOW.toISOString(), tables: dump }));
  console.log(`✓ backup of the development database: ${file}`);
}

/** Every single-column foreign key of the seeded tables points at a row (the load runs with key checks off). */
async function assertForeignKeys(c: pg.Client, tables: string[]) {
  const { rows } = await c.query(
    `select con.conrelid::regclass::text child, a.attname child_col, con.confrelid::regclass::text parent, b.attname parent_col
     from pg_constraint con
     join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     join pg_attribute b on b.attrelid = con.confrelid and b.attnum = con.confkey[1]
     where con.contype = 'f' and array_length(con.conkey, 1) = 1
       and con.connamespace = 'public'::regnamespace and con.conrelid::regclass::text = any($1)`,
    [tables.flatMap((t) => [t, `"${t}"`])],
  );
  for (const { child, child_col, parent, parent_col } of rows) {
    const { rows: [{ n }] } = await c.query(
      `select count(*)::int n from ${child} c where c."${child_col}" is not null
       and not exists (select 1 from ${parent} p where p."${parent_col}" = c."${child_col}")`,
    );
    if (n) throw new Error(`${n} row(s) of ${child}.${child_col} point at nothing in ${parent}`);
  }
}

// ---------------------------------------------------------------- wipe
async function wipe(db: Db): Promise<string[]> {
  const c = db.c;
  const wiped = (await tableNames(c)).filter((t) => isXpotDataTable(t) && !KEEP.has(t));
  // Kept catalogs must not point at rows that are about to disappear.
  await c.query("UPDATE print_model_versions SET fixes_batch_id = NULL WHERE fixes_batch_id IS NOT NULL");
  await c.query("UPDATE print_models SET customer_order_line_id = NULL WHERE customer_order_line_id IS NOT NULL");
  // DELETE (not TRUNCATE): kept tables reference some of these, and TRUNCATE refuses that even when no row does.
  // session_replication_role=replica skips the append-only triggers and the key checks; assertForeignKeys checks at the end.
  for (const t of wiped) await c.query(`DELETE FROM "${t}"`);
  await c.query("DELETE FROM organizations WHERE slug <> 'xpot-company'");
  await c.query("DELETE FROM auth_access_requests WHERE user_id LIKE 'demo-%'");
  // Serial ids start again after what is left.
  const { rows: seqs } = await c.query(
    `select c.table_name, c.column_name, pg_get_serial_sequence(format('%I', c.table_name), c.column_name) seq
     from information_schema.columns c
     where c.table_schema = 'public' and pg_get_serial_sequence(format('%I', c.table_name), c.column_name) is not null`,
  );
  for (const { table_name, column_name, seq } of seqs) {
    if (!wiped.includes(table_name) && table_name !== "organizations" && table_name !== "auth_access_requests") continue;
    await c.query(`select setval($1, coalesce((select max("${column_name}") from "${table_name}"), 0) + 1, false)`, [seq]);
  }
  await c.query("select setval('tag_kits_kit_number_seq', 1, false)").catch(() => undefined);
  return wiped;
}

// ---------------------------------------------------------------- seed
async function seed(db: Db) {
  const company = await db.one("select id from organizations where slug = 'xpot-company'");
  if (!company) throw new Error("organizations row 'xpot-company' is missing; run npm run migrate:dev first.");
  const org1 = company.id as number;
  const product = async (sku: string) => (await db.one("select id, base_price_cents from sales_products where sku=$1", [sku])) ?? null;
  const keychain = await product("KEY-3D");
  const plateLarge = await product("plate-large");
  const plateSmall = await product("plate-small");
  const standLarge = await product("stand-large");
  const standSmall = await product("stand-small");
  const website = await product("SITE-LP");
  if (!keychain || !plateLarge || !standLarge) throw new Error("product catalog (sales_products) is incomplete; run npm run migrate:dev first.");
  const productFor = (type: string) =>
    type === "large_plate" ? plateLarge : type === "small_plate" ? plateSmall ?? plateLarge
      : type === "large_stand" ? standLarge : type === "small_stand" ? standSmall ?? standLarge
        : type === "keychain" ? keychain : null;

  // ---- people ---------------------------------------------------------------
  // Real people already in this dev database keep their login: they become admins again.
  const realAdmins = (await db.c.query("select id, first_name, email from users where is_admin and id not like 'demo-%' order by created_at")).rows;

  type Person = {
    id: string; first: string; last: string; phone: string; admin?: boolean;
    rep?: Row; org?: number | "resale" | "print" | "closed"; orgRole?: "member" | "admin";
    access?: "draft" | "pending" | "approved" | "declined";
  };
  const people: Person[] = [
    { id: "demo-admin", first: "Demo", last: "Admin", phone: "+15550100001", admin: true, rep: { role: "admin", modules: ["visits", "tags"] }, org: 0, orgRole: "admin" },
    { id: "demo-rep-ana", first: "Ana", last: "Demo", phone: "+15550100002", rep: { role: "rep", modules: ["visits", "tags"], team: "Boston North" }, org: 0, orgRole: "member" },
    { id: "demo-rep-bruno", first: "Bruno", last: "Demo", phone: "+15550100003", rep: { role: "rep", modules: ["visits"], team: "Boston South", home_address: "1 Demo Home St, Quincy, MA", home_lat: "42.2529", home_lng: "-71.0023", route_return_home: true }, org: 0, orgRole: "member" },
    { id: "demo-reseller-carla", first: "Carla", last: "Reseller", phone: "+15550100004", rep: { role: "rep", modules: ["tags"], cost_policy: "acquisition", cost_policy_configured_at: days(-30), wholesale_code: "DEMOCARLA" }, org: "resale", orgRole: "admin" },
    { id: "demo-seller-diego", first: "Diego", last: "Seller", phone: "+15550100005", rep: { role: "rep", modules: ["tags"] }, org: "resale", orgRole: "member" },
    { id: "demo-printer-elisa", first: "Elisa", last: "Printer", phone: "+15550100006", rep: { role: "rep", modules: ["tags"] }, org: "print", orgRole: "admin" },
    { id: "demo-blocked-fabio", first: "Fabio", last: "Blocked", phone: "+15550100007", rep: { role: "rep", modules: ["visits", "tags"], blocked_at: days(-3), blocked_reason: "Demo: missed three consignment settlements" }, org: 0, orgRole: "member" },
    { id: "demo-refused-gil", first: "Gil", last: "Refused", phone: "+15550100008", rep: { role: "rep", is_active: false, refused_at: days(-10) } },
    { id: "demo-deleted-hugo", first: "Hugo", last: "Deleted", phone: "+15550100009", rep: { role: "rep", is_active: false, deleted_at: days(-20) } },
    { id: "demo-inactive-iris", first: "Iris", last: "Inactive", phone: "+15550100010", rep: { role: "rep", is_active: false }, org: "closed", orgRole: "member" },
    { id: "demo-applicant-jo", first: "Jo", last: "Draft", phone: "+15550100011", access: "draft" },
    { id: "demo-applicant-kai", first: "Kai", last: "Pending", phone: "+15550100012", access: "pending" },
    { id: "demo-applicant-lia", first: "Lia", last: "Approved", phone: "+15550100013", access: "approved", rep: { role: "rep", modules: ["visits", "tags"] }, org: 0, orgRole: "member" },
    { id: "demo-applicant-max", first: "Max", last: "Declined", phone: "+15550100014", access: "declined" },
  ];

  // ---- organizations ----------------------------------------------------------
  const orgResale = (await db.insert("organizations", { name: "Demo Resale Co", slug: "demo-resale", distribution: "own", created_by_user_id: null })).id as number;
  const orgPrint = (await db.insert("organizations", { name: "Demo Print Partner", slug: "demo-print-partner", prints_own_pieces: true, distribution: "xpot" })).id as number;
  const orgClosed = (await db.insert("organizations", { name: "Demo Closed Co", slug: "demo-closed", is_active: false })).id as number;
  const orgId = (o: Person["org"]) => (o === "resale" ? orgResale : o === "print" ? orgPrint : o === "closed" ? orgClosed : org1);
  await db.insert("organization_links", { producer_id: org1, seller_id: orgResale });
  await db.insert("organization_links", { producer_id: orgPrint, seller_id: orgResale });

  const rep: Record<string, number> = {};
  for (const p of people) {
    await db.c.query(
      `INSERT INTO users (id, email, first_name, last_name, phone, is_admin) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         phone=EXCLUDED.phone, is_admin=EXCLUDED.is_admin, profile_image_url=NULL, updated_at=now()`,
      [p.id, `${p.id.replace("demo-", "")}@demo.example.com`, p.first, p.last, p.phone, !!p.admin],
    );
    db.counts.set("users (demo)", (db.counts.get("users (demo)") ?? 0) + 1);
    if (p.rep) {
      const r = await db.insert("sales_reps", {
        user_id: p.id, display_name: `${p.first} ${p.last}`, email: `${p.id.replace("demo-", "")}@demo.example.com`, phone: p.phone,
        is_active: true, ...p.rep,
      });
      rep[p.id] = r.id as number;
      if (p.org !== undefined) {
        await db.insert("organization_memberships", {
          organization_id: orgId(p.org), rep_id: r.id, role: p.orgRole ?? "member",
          is_active: !p.rep.blocked_at, blocked_at: p.rep.blocked_at ?? null, blocked_reason: p.rep.blocked_reason ?? null,
        });
      }
    }
  }
  for (const a of realAdmins) {
    const r = await db.insert("sales_reps", { user_id: a.id, display_name: a.first_name || "Owner", email: a.email, role: "admin", is_active: true, modules: ["visits", "tags"] });
    await db.insert("organization_memberships", { organization_id: org1, rep_id: r.id, role: "admin", is_active: true });
  }
  const ana = rep["demo-rep-ana"], bruno = rep["demo-rep-bruno"], carla = rep["demo-reseller-carla"], diego = rep["demo-seller-diego"];
  const elisa = rep["demo-printer-elisa"], admin = rep["demo-admin"];

  // Access requests: one per status. The draft one is already "notified" so the abandoned-signup notifier stays quiet.
  for (const p of people.filter((x) => x.access)) {
    await db.insert("auth_access_requests", {
      user_id: p.id, email: `${p.id.replace("demo-", "")}@demo.example.com`, work_city: "Boston", work_region: "MA",
      occupation: "Demo occupation", languages: ["en", "pt"], status: p.access,
      draft_step: p.access === "draft" ? 2 : null, last_activity_at: minutes(-5),
      abandoned_notified_at: p.access === "draft" ? minutes(-1) : null,
      submitted_at: p.access === "draft" ? null : days(-2),
      reviewed_at: p.access === "approved" || p.access === "declined" ? days(-1) : null,
      reviewed_by_user_id: p.access === "approved" || p.access === "declined" ? "demo-admin" : null,
    });
  }
  await db.insert("organization_audit_log", { organization_id: orgResale, action: "member_added", target_rep_id: diego, actor_user_id: "demo-reseller-carla", detail: { demo: true } });
  await db.insert("organization_audit_log", { organization_id: org1, action: "member_blocked", target_rep_id: rep["demo-blocked-fabio"], actor_user_id: "demo-admin", detail: { demo: true } });

  // ---- leads ------------------------------------------------------------------
  const LEADS: Array<[string, string, string]> = [
    ["Demo Pizza Place", "restaurant", "customer"], ["Demo Hair Studio", "beauty_salon", "active"], ["Demo Dental Care", "dentist", "lead"],
    ["Demo Fitness Gym", "gym", "prospect"], ["Demo Corner Cafe", "cafe", "customer"], ["Demo Auto Repair", "car_repair", "inactive"],
    ["Demo Bakery", "bakery", "lead"], ["Demo Barber Shop", "barber_shop", "prospect"], ["Demo Pet Grooming", "pet_store", "active"],
    ["Demo Yoga Loft", "gym", "customer"], ["Demo Taqueria", "restaurant", "lead"], ["Demo Florist", "florist", "prospect"],
    ["Demo Nail Spa", "beauty_salon", "customer"], ["Demo Laundromat", "laundry", "inactive"], ["Demo Book Nook", "book_store", "active"],
    ["Demo Closed Diner", "restaurant", "inactive"],
  ];
  const leads: Row[] = [];
  for (const [i, [name, industry, status]] of LEADS.entries()) {
    const org = i >= 15 ? orgClosed : i % 5 === 4 ? orgResale : org1;
    const owner = org === orgResale ? (i % 2 ? carla : diego) : org === orgClosed ? rep["demo-inactive-iris"] : i % 2 ? ana : bruno;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
    const lead = await db.insert("sales_leads", {
      organization_id: org, name, legal_name: `${name} LLC`, industry, status, owner_rep_id: owner, source: i % 3 ? "manual" : "prospecting",
      website: i % 4 === 3 ? null : `https://${slug}.example.com`, phone: `+1555020${String(i).padStart(4, "0")}`, email: i % 4 === 2 ? null : `hello@${slug}.example.com`,
      google_place_id: i % 3 === 0 ? `demo-place-${i}` : null, photos: [], social_urls: i % 2 ? { instagram: `https://instagram.com/${slug}` } : {},
      territory_name: i % 2 ? "Boston North" : "Boston South", notes: i === 5 ? "Demo: owner asked us not to come back before spring." : null,
      last_visit_at: status === "prospect" ? null : days(-(i % 9) - 1), next_visit_due_at: status === "inactive" ? null : days((i % 6) + 1),
    });
    const p = point(i);
    await db.insert("sales_lead_locations", {
      lead_id: lead.id, label: "Main", address_line_1: `${100 + i} Demo Street`, city: i % 2 ? "Cambridge" : "Boston", state: "MA",
      postal_code: i % 2 ? "02139" : "02110", country: "US", lat: p.lat, lng: p.lng, geofence_radius_meters: i % 4 === 0 ? 50 : 150, is_primary: true,
    });
    if (i % 3 !== 2) {
      await db.insert("sales_lead_contacts", {
        lead_id: lead.id, name: `Owner of ${name}`, job_title: i % 2 ? "Owner" : "Manager", email: `owner@${slug}.example.com`,
        phone: `+1555030${String(i).padStart(4, "0")}`, is_primary: true,
      });
    }
    if (status === "customer") {
      await db.insert("lead_customer_contacts", { lead_id: lead.id, phone: `+1555040${String(i).padStart(4, "0")}`, verified_at: i % 2 ? days(-5) : null, created_by_user_id: "demo-admin" });
    }
    leads.push(lead);
  }
  const lead = (i: number) => leads[i].id as number;
  const locationOf = async (leadId: number) => (await db.one("select id from sales_lead_locations where lead_id=$1", [leadId])).id as number;

  // ---- visits: one per status, validation spread --------------------------------
  const VISIT_STATUSES = ["planned", "in_progress", "completed", "cancelled", "invalid", "no_answer", "came_back_later", "not_interested", "follow_up", "sale_made"] as const;
  const VALIDATION = ["valid", "outside_geofence", "gps_unavailable", "manual_override"] as const;
  const visits: Record<string, Row> = {};
  for (const [i, status] of VISIT_STATUSES.entries()) {
    const leadIdx = [1, 2, 0, 3, 6, 7, 8, 11, 10, 12][i];
    const who = i % 2 ? ana : bruno;
    const loc = await locationOf(lead(leadIdx));
    const p = point(leadIdx);
    const started = status === "planned" ? null : status === "in_progress" ? minutes(-35) : hours(-(i * 5) - 2);
    const ended = status === "planned" || status === "in_progress" || status === "cancelled" ? null : started ? minutes(-(i * 300) - 90) : null;
    const validation = status === "planned" ? null : VALIDATION[i % 4];
    visits[status] = await db.insert("sales_visits", {
      rep_id: who, lead_id: lead(leadIdx), location_id: loc, status,
      scheduled_at: status === "planned" ? days(1) : started, checked_in_at: started, checked_out_at: ended,
      duration_seconds: started && ended ? Math.round((ended.getTime() - started.getTime()) / 1000) : null,
      check_in_lat: started ? p.lat : null, check_in_lng: started ? p.lng : null,
      check_out_lat: ended ? p.lat : null, check_out_lng: ended ? p.lng : null,
      distance_from_target_meters: validation === "outside_geofence" ? 420 : started ? 12 : null,
      gps_accuracy_meters: validation === "gps_unavailable" ? null : started ? 8 : null,
      validation_status: validation ?? undefined,
      manual_override_reason: validation === "manual_override" ? "Demo: GPS drifted inside the mall" : null,
      // A visit left open past the time limit is closed as cancelled with expired_at (visit-timeout worker rule).
      expired_at: status === "cancelled" ? hours(-14) : null,
      source: i % 3 ? "manual" : "route",
    });
  }
  for (const status of ["completed", "sale_made", "follow_up", "not_interested"] as const) {
    const v = visits[status];
    await db.insert("sales_visit_notes", {
      visit_id: v.id, summary: `Demo visit (${status}): talked to the owner about review stands.`, outcome: status,
      sentiment: status === "not_interested" ? "negative" : "positive", objections: status === "not_interested" ? ["price"] : [],
      competitor_mentioned: status === "follow_up" ? "Demo Competitor" : null, next_step: status === "follow_up" ? "Bring a sample next week" : null,
      follow_up_required: status === "follow_up", attendee_name: "Demo Owner", created_by_rep_id: v.rep_id, summary_completed_at: v.checked_out_at,
    });
  }
  const ACTION_TYPES = ["deposit", "settlement", "sale", "follow_up"] as const;
  const ACTION_STATUSES = ["proposed", "applied", "dismissed", "failed"] as const;
  for (const [i, type] of ACTION_TYPES.entries()) {
    const v = visits[i % 2 ? "sale_made" : "completed"];
    await db.insert("sales_visit_actions", {
      visit_id: v.id, lead_id: v.lead_id, rep_id: v.rep_id, type, status: ACTION_STATUSES[i], payload: { demo: true, quantity: i + 1 },
      confidence: 60 + i * 10, applied_at: ACTION_STATUSES[i] === "applied" ? v.checked_out_at : null,
      error: ACTION_STATUSES[i] === "failed" ? "Demo: product out of stock" : null,
    });
  }
  const OPP: Array<[string, string]> = [["open", "pending"], ["won", "synced"], ["lost", "failed"], ["archived", "needs_review"]];
  for (const [i, [status, sync]] of OPP.entries()) {
    await db.insert("sales_opportunities_local", {
      lead_id: lead(i), rep_id: i % 2 ? ana : bruno, visit_id: i === 1 ? visits.sale_made.id : null, title: `Demo opportunity: ${status}`,
      value: [499, 1299, 149, 399][i], currency: "USD", status, sync_status: sync, loss_reason: status === "lost" ? "Demo: chose a competitor" : null,
      close_date: status === "open" ? days(14) : days(-3),
    });
  }
  const TASK_TYPES = ["follow_up", "call", "visit", "send_quote", "collect_payment", "check_consignment", "restock", "other"] as const;
  const TASK_STATUS = ["pending", "in_progress", "completed", "cancelled"] as const;
  const PRIORITY = ["low", "medium", "high", "urgent"] as const;
  const SOURCE = ["manual", "voice", "mcp", "automation", "integration"] as const;
  for (const [i, type] of TASK_TYPES.entries()) {
    const status = TASK_STATUS[i % 4];
    await db.insert("sales_tasks", {
      organization_id: org1, rep_id: i % 2 ? ana : bruno, lead_id: lead(i), type, title: `Demo task: ${type.replace("_", " ")}`,
      description: "Fake task from the development dataset.", status, priority: PRIORITY[i % 4], source: SOURCE[i % 5],
      due_at: i % 3 === 0 ? days(-1) : days(i), created_by_rep_id: admin, idempotency_key: `demo-task-${i}`,
      completed_at: status === "completed" ? days(-1) : null, cancelled_at: status === "cancelled" ? days(-2) : null,
    });
  }

  // ---- prospecting ------------------------------------------------------------
  // Completed jobs are already planned (ready/failed) and their routes are published or beyond,
  // so the automatic-route worker has nothing to pick up in development.
  const JOBS: Array<[string, string | null]> = [
    ["draft", null], ["queued", null], ["running", null], ["completed", "ready"], ["completed", "failed"], ["failed", null], ["cancelled", null],
  ];
  const jobs: Row[] = [];
  for (const [i, [status, planning]] of JOBS.entries()) {
    const job = await db.insert("prospecting_jobs", {
      rep_id: i % 2 ? ana : bruno, status, location: "Boston, MA", searches: [{ niche: "restaurant" }, { niche: "beauty_salon" }],
      hypothesis: "Demo: small restaurants want more Google reviews", result_count: status === "completed" ? 5 : 0,
      idempotency_key: `demo-job-${i}`, error_message: status === "failed" ? "Demo: engine timeout" : null,
      started_at: status === "draft" || status === "queued" ? null : hours(-6), completed_at: status === "completed" || status === "failed" ? hours(-5) : null,
      route_planning_status: planning ?? "pending", route_error_message: planning === "failed" ? "Demo: no stops inside the shift" : null,
    });
    jobs.push(job);
  }
  // Only one run may be starting/running at a time in the whole database (prospecting_runs_single_active_unique).
  const RUN_STATUS = ["queued", "running", "completed", "failed", "cancelled"] as const;
  const runs: Row[] = [];
  for (const [i, status] of RUN_STATUS.entries()) {
    const job = jobs[[1, 2, 3, 5, 6][i]];
    runs.push(await db.insert("prospecting_runs", {
      job_id: job.id, rep_id: job.rep_id, status, niche: i % 2 ? "beauty_salon" : "restaurant", query: `demo ${i}`, location: `Boston, MA #${i}`,
      result_count: status === "completed" ? 5 : 0, error_message: status === "failed" ? "Demo: quota exceeded" : null,
      engine_job_id: `demo-engine-${i}`, started_at: status === "queued" ? null : hours(-6), completed_at: status === "completed" ? hours(-5) : null,
    }));
  }
  const doneJob = jobs[3], doneRun = runs[2];
  const CANDIDATE_STATUS = ["discovered", "shortlisted", "scheduled", "visited", "discarded"] as const;
  const candidates: Row[] = [];
  for (const [i, status] of CANDIDATE_STATUS.entries()) {
    const p = point(30 + i);
    candidates.push(await db.insert("prospecting_candidates", {
      job_id: doneJob.id, run_id: doneRun.id, rep_id: doneJob.rep_id, status, source_id: `demo-src-${i}`, google_place_id: `demo-cand-${i}`,
      name: `Demo Prospect ${i + 1}`, address: `${200 + i} Demo Avenue`, city: "Boston", state: "MA", postal_code: "02115", country: "US",
      lat: p.lat, lng: p.lng, phone: `+1555050${String(i).padStart(4, "0")}`, website: i % 2 ? null : `https://prospect-${i}.example.com`,
      industry: "restaurant", rating_permille: 4100 + i * 150, review_count: 12 + i * 40, score: 90 - i * 10,
      lead_id: status === "visited" ? lead(3) : null, exclusion_reason: status === "discarded" ? "Demo: chain store" : null,
    }));
  }
  const ROUTES: Array<[string, number, number | null]> = [["draft", 3, null], ["published", 1, jobs[3].id as number], ["in_progress", 0, null], ["completed", -1, null], ["cancelled", -2, null]];
  const routes: Record<string, Row> = {};
  for (const [status, offset, jobId] of ROUTES) {
    const day = days(offset);
    const start = new Date(day); start.setHours(9, 0, 0, 0);
    routes[status] = await db.insert("prospecting_routes", {
      rep_id: status === "published" ? doneJob.rep_id : ana, job_id: jobId, name: `Demo route (${status})`, route_date: dateKey(day), status,
      planned_start_at: start, planned_end_at: new Date(start.getTime() + 8 * 3600_000), start_address: "Demo HQ, Boston",
      start_lat: BASE.lat.toFixed(6), start_lng: BASE.lng.toFixed(6), total_distance_meters: 18_500, total_duration_seconds: 5400,
      published_at: status === "draft" ? null : days(offset - 1), started_at: status === "in_progress" || status === "completed" ? start : null,
      completed_at: status === "completed" ? new Date(start.getTime() + 7 * 3600_000) : null,
    });
  }
  const STOPS: Array<[string, string, string]> = [
    ["completed", "completed", "planned"], ["completed", "skipped", "planned"], ["completed", "rescheduled", "ad_hoc"],
    ["in_progress", "completed", "planned"], ["in_progress", "checked_in", "planned"], ["in_progress", "en_route", "planned"], ["in_progress", "planned", "ad_hoc"],
    ["published", "planned", "planned"], ["published", "planned", "planned"],
  ];
  const position: Record<string, number> = {};
  for (const [i, [route, status, origin]] of STOPS.entries()) {
    const r = routes[route];
    position[route] = (position[route] ?? 0) + 1;
    const p = point(40 + i);
    await db.insert("prospecting_route_stops", {
      route_id: r.id, position: position[route], status, origin, name: `Demo stop ${i + 1}`, address: `${300 + i} Demo Road`, lat: p.lat, lng: p.lng,
      candidate_id: route === "published" ? candidates[i % 5].id : null, lead_id: route === "published" ? null : lead(i),
      visit_id: status === "checked_in" ? visits.in_progress.id : null, service_duration_seconds: 900, travel_distance_meters: 1200 + i * 300,
      travel_duration_seconds: 300 + i * 60, estimated_arrival_at: new Date((r.planned_start_at as Date).getTime() + i * 1800_000),
      skip_reason: status === "skipped" ? "Demo: closed for lunch" : null, completed_at: status === "completed" ? minutes(-60) : null,
    });
  }

  // ---- consignments and sales ------------------------------------------------------
  const consignActive = await db.insert("sales_consignments", {
    organization_id: org1, lead_id: lead(4), product_id: keychain.id, rep_id: ana, status: "active", unit_price_cents: 500, currency: "USD",
    quantity_on_hand: 8, total_deposited: 12, total_sold: 3, total_returned: 1, total_settled_cents: 1500, settlement_interval_days: 14,
    opened_at: days(-30), last_settlement_at: days(-7), next_visit_due_at: days(7), notes: "Demo consignment on the counter",
  });
  const consignClosed = await db.insert("sales_consignments", {
    organization_id: org1, lead_id: lead(5), product_id: keychain.id, rep_id: bruno, status: "closed", unit_price_cents: 500, currency: "USD",
    quantity_on_hand: 0, total_deposited: 10, total_sold: 6, total_returned: 4, total_settled_cents: 3000, opened_at: days(-90), closed_at: days(-20),
  });
  const sale = async (o: Row, items: Array<[number | null, string, number, number]>) => {
    const subtotal = items.reduce((s, [, , q, p]) => s + q * p, 0);
    const discount = (o.discount_cents as number) ?? 0;
    const s = await db.insert("sales_sales", {
      organization_id: org1, currency: "USD", subtotal_cents: subtotal, total_cents: subtotal - discount, sold_at: days(-2), ...o,
    });
    const created: Row[] = [];
    for (const [productId, description, quantity, price] of items) {
      created.push(await db.insert("sales_sale_items", {
        sale_id: s.id, product_id: productId, description, quantity, unit_price_cents: price, total_cents: quantity * price, net_total_cents: quantity * price,
      }));
    }
    return { sale: s, items: created };
  };
  const salePaid = await sale({ lead_id: lead(0), rep_id: ana, visit_id: visits.sale_made.id, kind: "direct", status: "completed", payment_status: "paid", payment_method: "card", paid_cents: 3598, paid_at: days(-2), idempotency_key: "demo-sale-1" }, [[plateLarge.id, "Large Plate — Google review", 2, 1799]]);
  const salePartial = await sale({ lead_id: lead(9), rep_id: bruno, kind: "direct", status: "completed", payment_status: "partial", payment_method: "cash", paid_cents: 2500, discount_cents: 500, idempotency_key: "demo-sale-2" }, [[standLarge.id, "Large Stand — Instagram", 1, 5000], [website?.id ?? null, "Landing page setup (demo)", 1, 0]]);
  const saleUnpaid = await sale({ lead_id: lead(12), rep_id: ana, kind: "direct", status: "completed", payment_status: "unpaid", idempotency_key: "demo-sale-3" }, [[plateLarge.id, "Large Plate — Menu", 3, 1799]]);
  const saleSettle = await sale({ lead_id: lead(4), rep_id: ana, consignment_id: consignActive.id, kind: "consignment_settlement", status: "completed", payment_status: "paid", payment_method: "cash", paid_cents: 1500, paid_at: days(-7), idempotency_key: "demo-sale-4" }, [[keychain.id, "Keychains sold on consignment", 3, 500]]);
  const saleCancelled = await sale({ lead_id: lead(2), rep_id: bruno, kind: "direct", status: "cancelled", payment_status: "unpaid", cancelled_at: days(-1), cancel_reason: "Demo: customer changed their mind", idempotency_key: "demo-sale-5" }, [[plateLarge.id, "Large Plate — Website", 1, 1799]]);
  const saleReseller = await sale({ organization_id: orgResale, lead_id: lead(4 + 5), rep_id: carla, kind: "direct", status: "completed", payment_status: "paid", payment_method: "zelle", paid_cents: 1799, paid_at: days(-4), idempotency_key: "demo-sale-6" }, [[plateLarge.id, "Large Plate — Yelp", 1, 1799]]);
  const MOVES: Array<[string, Row, number, number, number]> = [
    ["deposit", consignActive, 12, 0, 12], ["settlement", consignActive, 3, 12, 9], ["return", consignActive, 1, 9, 8], ["adjustment", consignClosed, 2, 2, 0],
  ];
  for (const [type, cons, quantity, before, after] of MOVES) {
    await db.insert("sales_consignment_movements", {
      consignment_id: cons.id, rep_id: cons.rep_id, type, quantity, on_hand_before: before, on_hand_after: after, unit_price_cents: 500,
      amount_cents: type === "settlement" ? quantity * 500 : 0, sale_id: type === "settlement" ? saleSettle.sale.id : null, occurred_at: days(-10),
      counted_remaining: type === "settlement" ? after : null, notes: `Demo ${type}`,
    });
  }

  // ---- tags: batches, pieces, stock, events --------------------------------------------
  const BATCHES: Array<[number, string, string, string, string]> = [
    [org1, "large_plate", "open", "issued", "google_review"], [org1, "small_stand", "closed", "issued", "instagram"], [org1, "keychain", "cancelled", "issued", "website"],
    [orgResale, "large_stand", "open", "scanned", "yelp"], [orgPrint, "small_plate", "open", "issued", "menu"], [org1, "custom", "closed", "scanned", "custom"],
  ];
  const batches: Row[] = [];
  for (const [i, [org, type, status, source, face]] of BATCHES.entries()) {
    batches.push(await db.insert("tag_batches", {
      organization_id: org, batch_code: `DEMO-B${i + 1}`, name: `Demo batch ${i + 1} (${type}, ${status})`, product_type: type, face, status, code_source: source,
      vendor: source === "scanned" ? "Demo Vendor" : null, quantity: 10, sales_product_id: productFor(type)?.id ?? null, created_by_user_id: "demo-admin",
      closed_at: status === "closed" ? days(-5) : null, closed_by_user_id: status === "closed" ? "demo-admin" : null,
      notes: status === "cancelled" ? "Demo: misprinted, cancelled" : null,
    }));
  }
  const kitAna = await db.insert("tag_kits", { organization_id: org1, rep_id: ana, note: "Demo starter kit", created_by_user_id: "demo-admin" });
  const kitCarla = await db.insert("tag_kits", { organization_id: orgResale, rep_id: carla, note: "Demo reseller kit", created_by_user_id: "demo-admin", source_organization_id: org1 });

  // Every scenario a piece can be in. [status, stock, ownership, holder]
  type Scenario = [string, string, string, "company" | "ana" | "carla" | "customer"];
  const SCENARIOS: Scenario[] = [
    ["inventory", "pending", "company", "company"], ["inventory", "available", "company", "company"], ["assigned", "available", "rep", "ana"],
    ["assigned", "reserved", "rep", "ana"], ["active", "sold", "customer", "customer"], ["active", "sold", "customer", "customer"],
    ["active", "sold", "customer", "customer"], ["disabled", "sold", "customer", "customer"], ["retired", "retired", "company", "company"],
    ["inventory", "damaged", "company", "company"], ["assigned", "lost", "rep", "ana"], ["active", "internal_use", "company", "company"],
    ["assigned", "available", "rep", "carla"], ["active", "sold", "customer", "customer"],
  ];
  const tags: Row[] = [];
  const serials: Record<number, number> = {};
  let destIndex = 0;
  for (let i = 0; i < 52; i++) {
    const [status, stock, ownership, holder] = SCENARIOS[i % SCENARIOS.length];
    const type = PRODUCT_TYPES[i % PRODUCT_TYPES.length];
    const resale = holder === "carla" || i % 9 === 4;
    const org = holder === "carla" ? orgResale : i % 17 === 8 ? orgPrint : resale ? orgResale : org1;
    const batch = batches.find((b) => b.product_type === type && b.organization_id === org) ?? null;
    const holderRep = holder === "ana" ? ana : holder === "carla" ? carla : null;
    const dest = status === "active" ? DESTINATIONS[destIndex++ % DESTINATIONS.length] : status === "disabled" ? DESTINATIONS[0] : null;
    const leadIdx = holder === "customer" ? (org === orgResale ? 9 : [0, 4, 9, 12][i % 4]) : null;
    const nfc = NFC[i % NFC.length];
    const t = await db.insert("tags", {
      organization_id: org, public_code: code(i + 1), batch_id: batch?.id ?? null,
      serial_number: batch ? (serials[batch.id as number] = (serials[batch.id as number] ?? 0) + 1) : null,
      product_type: type, face: FACES[i % FACES.length], sales_product_id: productFor(type)?.id ?? null, status,
      stock_status: stock, ownership_type: ownership, custodian_rep_id: holderRep, rep_id: holderRep ?? (holder === "customer" ? (org === orgResale ? carla : ana) : null),
      kit_id: holder === "ana" && stock === "available" ? kitAna.id : holder === "carla" ? kitCarla.id : null,
      lead_id: leadIdx === null ? null : lead(leadIdx), destination_type: dest?.[0] ?? null, destination_url: dest?.[1] ?? null,
      utm_enabled: i % 3 === 0, utm_campaign: i % 3 === 0 ? "demo-campaign" : null, label: `Demo piece ${i + 1}`, metadata: { demo: true },
      assigned_at: status === "inventory" ? null : days(-20), activated_at: status === "active" || status === "disabled" ? days(-10) : null,
      activated_by_rep_id: status === "active" ? (holderRep ?? ana) : null, disabled_at: status === "disabled" ? days(-2) : null,
      sold_at: stock === "sold" ? days(-10) : null, nfc_provisioning_status: nfc,
      nfc_programmed_at: nfc === "not_programmed" || nfc === "failed" ? null : days(-25), nfc_verified_at: nfc === "verified" || nfc === "locked" ? days(-25) : null,
      nfc_locked_at: nfc === "locked" ? days(-24) : null, registered_at: days(-30), registered_by_user_id: "demo-admin",
      internal_use_note: stock === "internal_use" ? "Demo: used on the office door" : null, stock_updated_at: days(-10),
    });
    tags.push(t);
  }
  // Kit items: still in the kit, returned, moved to another kit.
  const anaKitTags = tags.filter((t) => t.kit_id === kitAna.id);
  for (const [i, t] of anaKitTags.entries()) {
    await db.insert("tag_kit_items", { kit_id: kitAna.id, tag_id: t.id, public_code: t.public_code, batch_id: t.batch_id, handed_out_at: days(-20) });
    if (i === 0) {
      const back = tags.find((x) => x.stock_status === "available" && x.ownership_type === "company")!;
      await db.insert("tag_kit_items", { kit_id: kitAna.id, tag_id: back.id, public_code: back.public_code, batch_id: back.batch_id, handed_out_at: days(-25), left_at: days(-15), left_reason: "returned" });
    }
  }
  for (const t of tags.filter((x) => x.kit_id === kitCarla.id)) {
    await db.insert("tag_kit_items", { kit_id: kitCarla.id, tag_id: t.id, public_code: t.public_code, batch_id: t.batch_id, handed_out_at: days(-12) });
  }
  const moved = tags.find((x) => x.kit_id === kitCarla.id);
  if (moved) await db.insert("tag_kit_items", { kit_id: kitAna.id, tag_id: moved.id, public_code: moved.public_code, batch_id: moved.batch_id, handed_out_at: days(-18), left_at: days(-12), left_reason: "moved" });

  // Stock movements: the movement that put each piece where it is, then one of every other kind on a sample piece.
  const lastMove: Record<string, string> = { pending: "intake", available: "issue", reserved: "reserve", sold: "sale", internal_use: "internal_use", damaged: "damage", lost: "loss", retired: "retire" };
  for (const [i, t] of tags.entries()) {
    await db.insert("tag_stock_movements", {
      tag_id: t.id, movement_type: i === 0 ? "migration" : lastMove[t.stock_status as string], from_stock_status: i === 0 ? null : "available",
      to_stock_status: t.stock_status, from_ownership_type: "company", to_ownership_type: t.ownership_type, to_custodian_rep_id: t.custodian_rep_id,
      actor_user_id: "demo-admin", reason: "Demo dataset", idempotency_key: `demo-move-${i}`,
    });
  }
  const sample = tags[2];
  for (const [i, type] of ["transfer", "return", "release", "restore", "adjustment"].entries()) {
    await db.insert("tag_stock_movements", {
      tag_id: sample.id, movement_type: type, from_stock_status: "available", to_stock_status: "available", from_ownership_type: "rep",
      to_ownership_type: "rep", from_custodian_rep_id: ana, to_custodian_rep_id: ana, actor_user_id: "demo-admin", reason: `Demo ${type}`, idempotency_key: `demo-move-extra-${i}`,
    });
  }
  // Scans: redirects (QR and NFC), plus the three problem scans.
  for (const [i, t] of tags.filter((x) => x.status === "active").entries()) {
    for (let n = 0; n < (i % 4) + 1; n++) {
      await db.insert("tag_events", {
        tag_id: t.id, lead_id: t.lead_id, rep_id: t.rep_id, access_method: n % 2 ? "nfc" : "qr", event_type: "redirect", occurred_at: hours(-(i * 7 + n * 3)),
        device_type: n % 2 ? "mobile" : "tablet", os_family: n % 2 ? "iOS" : "Android", browser_family: n % 2 ? "Safari" : "Chrome", country_code: "US", is_bot: false,
      });
    }
  }
  const byStatus = (s: string) => tags.find((t) => t.status === s)!;
  await db.insert("tag_events", { tag_id: byStatus("inventory").id, access_method: "qr", event_type: "inventory_scan", occurred_at: hours(-3), is_bot: false });
  await db.insert("tag_events", { tag_id: byStatus("disabled").id, access_method: "nfc", event_type: "disabled_scan", occurred_at: hours(-2), is_bot: false });
  await db.insert("tag_events", { tag_id: byStatus("assigned").id, access_method: "qr", event_type: "misconfigured_scan", occurred_at: hours(-1), is_bot: true });
  for (const t of tags.filter((x) => x.status === "active").slice(0, 4)) {
    await db.insert("tag_destination_history", {
      tag_id: t.id, previous_url: null, new_url: t.destination_url, previous_destination_type: null, new_destination_type: t.destination_type,
      changed_by_user_id: "demo-rep-ana", reason: "Demo: first activation",
    });
  }

  // Acquisitions (reseller buying pieces) in every source and status, with their units and cost lines.
  const resaleTags = tags.filter((t) => t.organization_id === orgResale);
  const ACQ: Array<[string, string, string | null]> = [["stuscle", "fulfilled", "DEMO-STU-1001"], ["manual", "pending", null], ["house", "fulfilled", null], ["migration", "cancelled", null]];
  const units: Row[] = [];
  for (const [i, [source, status, ref]] of ACQ.entries()) {
    const acq = await db.insert("tag_acquisitions", {
      rep_id: carla, organization_id: orgResale, kit_id: i === 0 ? kitCarla.id : null, source, external_ref: ref, currency: "USD", status,
      purchased_at: days(-15 + i), created_by_user_id: "demo-reseller-carla", fulfilled_from_organization_id: source === "house" ? org1 : null,
    });
    const qty = status === "fulfilled" ? Math.min(3, resaleTags.length - units.length) : 2;
    const line = await db.insert("tag_acquisition_lines", {
      acquisition_id: acq.id, sales_product_id: plateLarge.id, external_sku: source === "stuscle" ? "STU-PLATE-L" : null,
      quantity: Math.max(qty, 1), subtotal_cents: Math.max(qty, 1) * 900, unit_cost_cents: 900,
    });
    if (status === "fulfilled") {
      for (let n = 0; n < qty; n++) {
        const t = resaleTags[units.length];
        if (!t) break;
        units.push(await db.insert("tag_acquisition_units", {
          acquisition_line_id: line.id, tag_id: t.id, unit_cost_cents: 900, assigned_at: days(-14),
          override_cost_cents: n === 1 ? 700 : null, override_reason: n === 1 ? "Demo: damaged box discount" : null, overridden_by_user_id: n === 1 ? "demo-admin" : null,
          returned_at: n === 2 ? days(-3) : null,
        }));
      }
    }
  }
  // Pieces sold through sales, with every cost source and status.
  const soldTags = tags.filter((t) => t.stock_status === "sold");
  const COST: Array<[string, string]> = [["policy_zero", "active"], ["manual_override", "active"], ["acquisition", "active"], ["sale_item", "cancelled"], ["policy_zero", "returned"]];
  for (const [i, [source, status]] of COST.entries()) {
    const t = soldTags[i % soldTags.length];
    const s = source === "acquisition" ? saleReseller : i === 3 ? saleCancelled : salePaid;
    await db.insert("sales_sale_tags", {
      sale_id: s.sale.id, sale_item_id: s.items[0].id, tag_id: t.id, acquisition_unit_id: source === "acquisition" ? units[0]?.id ?? null : null,
      cost_basis_cents: source === "policy_zero" ? 0 : 900, cost_source: source, status, sold_at: days(-10), ended_at: status === "active" ? null : days(-1),
    });
  }

  // Plans and the tag journey (decisions, insights...).
  const PLAN_STATUS = ["draft", "active", "paused", "validated", "invalidated", "done", "cancelled"] as const;
  const PLAN_KIND = ["strategy", "hypothesis", "experiment", "target", "task"] as const;
  const plans: Row[] = [];
  for (const [i, status] of PLAN_STATUS.entries()) {
    plans.push(await db.insert("tag_plans", {
      kind: PLAN_KIND[i % 5], title: `Demo plan: ${PLAN_KIND[i % 5]} (${status})`, description: "Fake plan from the development dataset.", status,
      batch_id: batches[i % batches.length].id, lead_id: i % 2 ? lead(0) : null, due_date: dateKey(days(i * 3)), created_by_user_id: "demo-admin",
      outcome: status === "validated" || status === "invalidated" ? "Demo outcome" : null, closed_at: ["validated", "invalidated", "done", "cancelled"].includes(status) ? days(-1) : null,
    }));
  }
  const J_KIND = ["execution", "decision", "insight", "observation", "risk", "result"] as const;
  const J_SOURCE = ["system", "admin", "field", "mcp"] as const;
  const J_ACTOR = ["human", "ai", "system"] as const;
  const J_STATUS = ["active", "needs_review", "archived", "superseded"] as const;
  for (const [i, kind] of J_KIND.entries()) {
    await db.insert("tag_journey_entries", {
      kind, action: `demo_${kind}`, title: `Demo ${kind}: Google review plates sell best at restaurants`, content: "Fake journey entry.",
      batch_id: batches[0].id, tag_id: tags[i].id, plan_id: plans[i].id, rep_id: ana, lead_id: lead(0), source: J_SOURCE[i % 4], actor: J_ACTOR[i % 3],
      actor_user_id: "demo-admin", actor_rep_id: ana, status: J_STATUS[i % 4], metadata: { demo: true }, occurred_at: days(-i),
    });
  }

  // ---- print production and NFC provisioning --------------------------------------------
  const serial = await db.one(
    `select m.id model_id, v.id version_id, v.beds from print_models m join print_model_versions v on v.id = m.current_version_id
     where m.kind='serialized' and m.status='ready' order by m.slug limit 1`,
  );
  const part = await db.one("select id from print_models where kind='part' order by slug limit 1");
  const devices: Record<string, Row> = {};
  for (const [status, org] of [["pairing", org1], ["active", org1], ["revoked", orgPrint], ["active", orgPrint]] as Array<[string, number]>) {
    const key = `${status}-${org}`;
    devices[key] = await db.insert("tag_provisioning_devices", {
      device_name: `Demo ${status} device (${org === org1 ? "company" : "print partner"})`, platform: "windows", app_version: "0.0.0-demo", status, organization_id: org,
      pairing_expires_at: status === "pairing" ? hours(1) : null, last_seen_at: status === "active" ? minutes(-2) : null, paired_at: status === "pairing" ? null : days(-30),
      revoked_at: status === "revoked" ? days(-3) : null, created_by_user_id: "demo-admin", capabilities: { nfc: true, print: status === "active" },
    });
  }
  const activeDevice = devices[`active-${org1}`];
  if (serial) {
    const bed = Array.isArray(serial.beds) && serial.beds[0]?.label ? String(serial.beds[0].label) : "x4";
    const requests: Row[] = [];
    for (const [i, org] of [org1, orgPrint].entries()) {
      requests.push(await db.insert("print_requests", {
        model_id: serial.model_id, version_id: serial.version_id, bed_label: bed, quantity: 4 * (i + 1), notes: "Demo print request", source: "admin",
        requested_by_user_id: "demo-admin", organization_id: org,
      }));
    }
    const JOB_STATUS = ["requested", "building", "ready", "printing", "printed", "failed", "cancelled"] as const;
    for (const [i, status] of JOB_STATUS.entries()) {
      const busy = status === "printing" || status === "printed";
      await db.insert("print_jobs", {
        model_id: serial.model_id, version_id: serial.version_id, bed_label: bed, plates: 1, quantity: 4, status, request_id: requests[i % 2].id,
        organization_id: requests[i % 2].organization_id, device_id: busy ? activeDevice.id : null, requested_by_user_id: "demo-admin",
        claimed_at: status === "requested" ? null : hours(-5), built_at: ["ready", "printing", "printed"].includes(status) ? hours(-4) : null,
        printed_at: status === "printed" ? hours(-1) : null, error_code: status === "failed" ? "demo_nozzle_clog" : null,
        error_message: status === "failed" ? "Demo: nozzle clogged on plate 1" : null, notes: `Demo job (${status})`, last_event_at: hours(-1),
        batch_id: status === "printed" ? batches[0].id : null, plate_number: 1,
      });
    }
  }
  if (part) {
    for (const [reason, delta] of [["printed", 10], ["assembled", -4], ["used", -2], ["adjustment", 1]] as Array<[string, number]>) {
      await db.insert("print_part_movements", { model_id: part.id, delta, reason, note: `Demo ${reason}`, actor_user_id: "demo-admin" });
    }
  }
  const PJ_STATUS = ["pending", "claimed", "writing", "verifying", "succeeded", "failed", "cancelled"] as const;
  const provJobs: Row[] = [];
  for (const [i, status] of PJ_STATUS.entries()) {
    const t = tags[i + 1];
    provJobs.push(await db.insert("tag_provisioning_jobs", {
      tag_id: t.id, expected_url: `https://xpot.example.com/t/${t.public_code}`, status, requested_by_user_id: "demo-admin",
      target_device_id: activeDevice.id, claimed_by_device_id: status === "pending" ? null : activeDevice.id,
      readback_url: status === "succeeded" ? `https://xpot.example.com/t/${t.public_code}` : null, tag_type: "NTAG213",
      error_code: status === "failed" ? "demo_write_failed" : null, error_message: status === "failed" ? "Demo: tag moved during write" : null,
      claimed_at: status === "pending" ? null : minutes(-30), completed_at: ["succeeded", "failed", "cancelled"].includes(status) ? minutes(-20) : null,
      expires_at: hours(2),
    }));
  }
  const PE = ["job_created", "job_claimed", "job_cancelled", "job_expired", "reader_connected", "reader_disconnected", "tag_detected", "write_started",
    "write_completed", "verification_passed", "verification_failed", "lock_requested", "lock_completed", "erase_completed", "error"];
  for (const [i, event] of PE.entries()) {
    const job = provJobs[i % provJobs.length];
    await db.insert("tag_provisioning_events", { job_id: job.id, tag_id: job.tag_id, device_id: activeDevice.id, event_type: event, detail: { demo: true } });
  }
  await db.insert("tag_direct_writes", { lead_id: lead(0), rep_id: ana, url: "https://g.page/r/demo-review", label: "Demo review link", method: "web_nfc", verified: true, written_by_user_id: "demo-rep-ana" });
  await db.insert("tag_direct_writes", { lead_id: lead(1), rep_id: bruno, url: "https://demo-hair.example.com", label: "Demo website", method: "manual", verified: false, written_by_user_id: "demo-rep-bruno" });
  await db.insert("tag_showcase_items", { kind: "model", title: "Demo Large Plate — Google review", description: "Fake showcase item", includes: ["1 large plate"], reference_price_cents: 1799, currency: "USD", sort_order: 1, is_published: true, created_by_user_id: "demo-admin" });
  await db.insert("tag_showcase_items", { kind: "kit", title: "Demo Starter Kit", description: "Fake kit (unpublished)", includes: ["5 plates", "2 stands"], items: [{ product_type: "large_plate", quantity: 5 }], reference_price_cents: 12900, currency: "USD", sort_order: 2, is_published: false, created_by_user_id: "demo-admin" });

  // ---- customer orders -------------------------------------------------------------
  const order = await db.insert("customer_orders", {
    organization_id: org1, lead_id: lead(0), rep_id: ana, visit_id: visits.sale_made.id, currency: "USD", status: "open", revision: 3,
    notes: "Demo order: menu plates for every table", created_by_user_id: "demo-rep-ana",
  });
  const standard = await db.insert("customer_order_lines", {
    order_id: order.id, sequence: 1, quantity: 5, description: "Large Plate — Menu (standard)", sales_product_id: plateLarge.id, product_type: "large_plate",
    face: "menu", theme: "black", unit_price_cents: 1799, producer_organization_id: org1, model_id: serial?.model_id ?? null, version_id: serial?.version_id ?? null, custom: "standard",
  });
  const custom = await db.insert("customer_order_lines", {
    order_id: order.id, sequence: 2, quantity: 2, cancelled_quantity: 1, description: "Custom logo stand", sales_product_id: standLarge.id, product_type: "large_stand",
    face: "custom", unit_price_cents: 6500, producer_organization_id: orgPrint, custom: "custom",
  });
  const delivered = await db.insert("customer_order_deliveries", { order_id: order.id, sale_id: salePaid.sale.id, status: "confirmed", actor_user_id: "demo-rep-ana" });
  await db.insert("customer_order_deliveries", { order_id: order.id, sale_id: saleCancelled.sale.id, status: "reversed", actor_user_id: "demo-admin" });
  const PIECES: Array<[string, string, string, string]> = [
    ["allocated", "assigned", "reserved", "rep"], ["delivered", "active", "sold", "customer"], ["released", "inventory", "available", "company"],
    ["damaged", "inventory", "damaged", "company"], ["returned", "inventory", "available", "company"],
  ];
  for (const [i, [state, status, stock, ownership]] of PIECES.entries()) {
    const t = await db.insert("tags", {
      organization_id: org1, public_code: code(900 + i), product_type: "large_plate", face: "menu", sales_product_id: plateLarge.id, status, stock_status: stock,
      ownership_type: ownership, custodian_rep_id: ownership === "rep" ? ana : null, rep_id: ana, lead_id: ownership === "customer" ? lead(0) : null,
      destination_type: status === "active" ? "menu" : null, destination_url: status === "active" ? "https://demo-pizza.example.com/menu" : null,
      label: `Demo order piece (${state})`, customer_order_line_id: state === "released" ? null : standard.id, registered_at: days(-6), registered_by_user_id: "demo-admin",
      sold_at: stock === "sold" ? days(-2) : null, activated_at: status === "active" ? days(-2) : null,
    });
    await db.insert("customer_order_pieces", { line_id: standard.id, tag_id: t.id, state, delivery_id: state === "delivered" ? delivered.id : null });
  }
  for (const [i, action] of ["order_created", "line_added", "line_added", "piece_allocated", "delivery_confirmed"].entries()) {
    await db.insert("customer_order_events", { order_id: order.id, action, command_key: `demo-cmd-${i}`, fingerprint: `demo-fp-${i}`, actor_user_id: "demo-rep-ana", detail: { demo: true } });
  }
  for (const [kind, amount] of [["received", 5000], ["applied", 3598], ["refund", 500], ["retained", 400], ["release", 502]] as Array<[string, number]>) {
    await db.insert("customer_order_payments", {
      order_id: order.id, kind, amount_cents: amount, payment_method: "card", delivery_id: kind === "applied" ? delivered.id : null,
      reason: `Demo ${kind}`, actor_user_id: "demo-rep-ana",
    });
  }
  await db.insert("customer_order_artwork", { line_id: custom.id, revision: 1, kind: "brief", description: "Demo brief: logo centered, black background", status: "approved", created_by_user_id: "demo-rep-ana", approved_by: "Demo Owner", approval_method: "in_person", approved_at: days(-4) });
  // Revisions are numbered per line across kinds (customer_order_artwork_line_id_revision_key).
  await db.insert("customer_order_artwork", { line_id: custom.id, revision: 2, kind: "proof", description: "Demo proof v1", status: "superseded", created_by_user_id: "demo-printer-elisa" });
  await db.insert("customer_order_artwork", { line_id: custom.id, revision: 3, kind: "proof", description: "Demo proof v2", status: "proposed", created_by_user_id: "demo-printer-elisa" });
  await db.insert("customer_orders", { organization_id: org1, lead_id: lead(2), rep_id: bruno, currency: "USD", status: "cancelled", revision: 1, notes: "Demo cancelled order", created_by_user_id: "demo-rep-bruno" });
  await db.insert("sales_tasks", {
    organization_id: org1, rep_id: ana, lead_id: lead(0), customer_order_id: order.id, type: "visit", title: "Demo: deliver the menu plates",
    status: "pending", priority: "high", source: "automation", idempotency_key: "demo-task-order", due_at: days(2),
  });

  // ---- system ----------------------------------------------------------------------
  await db.insert("system_events", { level: "error", source: "demo", message: "Demo error: printer offline", fingerprint: "demo-error-1", detail: { demo: true }, rep_id: elisa });
  await db.insert("system_events", { level: "warn", source: "demo", message: "Demo warning: slow Google Places response", fingerprint: "demo-warn-1", detail: { demo: true } });
}

/** Nothing real leaves a development machine: SMS, Google Places, Xphere sync and AI providers off. */
async function switchOffOutbound(c: pg.Client) {
  const changes = [
    await c.query("UPDATE integration_settings SET is_enabled = false, updated_at = now() WHERE is_enabled"),
    await c.query("UPDATE chat_integrations SET enabled = false, updated_at = now() WHERE enabled"),
    await c.query("UPDATE xphere_integrations SET is_enabled = false, updated_at = now() WHERE is_enabled"),
  ];
  const n = changes.reduce((s, r) => s + (r.rowCount ?? 0), 0);
  console.log(`✓ outbound integrations switched off in development (${n} changed)`);
}

async function main() {
  const url = seedDatabaseUrl(process.env);
  console.log(`→ seeding ${describeDatabaseTarget(url, { ...process.env, NODE_ENV: "development" })}${DRY_RUN ? " (dry run: nothing is saved)" : ""}`);
  const client = new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, (m) => (m.startsWith("?") ? "?" : "")),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const db = new Db(client);
  try {
    await db.loadColumnTypes();
    if (!DRY_RUN) await backup(client);
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    const wiped = await wipe(db);
    await seed(db);
    await switchOffOutbound(client);
    await assertForeignKeys(client, [...wiped, "organizations", "auth_access_requests", "users"]);
    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("✓ dry run passed; rolled back");
    } else {
      await client.query("COMMIT");
      console.log("✓ fake development dataset saved");
    }
    console.log(Array.from(db.counts).map(([t, n]) => `${t}=${n}`).join("  "));
    if (!DRY_RUN) {
      console.log("\nSign in (development shows the code on screen):");
      console.log("  +15550100001 Demo Admin (platform admin)   +15550100002 Ana (rep: visits + pieces)");
      console.log("  +15550100003 Bruno (visits only)            +15550100004 Carla (reseller admin, buys pieces)");
      console.log("  +15550100006 Elisa (print partner admin)    +15550100007 Fabio (blocked)");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
