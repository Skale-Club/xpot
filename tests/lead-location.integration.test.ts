import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, expect, test, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));

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

const { db } = await import("../server/db.js");
const { storage } = await import("../server/storage.js");
const { salesLeadLocations } = await import("../shared/schema.js");
const { defaultGeofenceRadiusSql } = await import("../server/lead-location.js");
const { sql } = await import("drizzle-orm");

afterAll(async () => pg.client?.close());

test("new locations take the admin default radius and updates keep a custom one", async () => {
  await storage.updateSalesAppSettings({ defaultGeofenceRadiusMeters: 275 });
  const org = (await db.execute(sql`
    INSERT INTO organizations (name, slug) VALUES ('Radius Team', 'radius-team') RETURNING id
  `)).rows[0] as { id: number };
  const lead = (await db.execute(sql`
    INSERT INTO sales_leads (organization_id, name) VALUES (${org.id}, 'Radius Co') RETURNING id
  `)).rows[0] as { id: number };

  const created = await storage.createSalesLeadLocation({ leadId: lead.id, addressLine1: "1 Elm St", isPrimary: true });
  expect(created.geofenceRadiusMeters).toBe(275);

  await db.update(salesLeadLocations).set({ geofenceRadiusMeters: 60 }).where(sql`${salesLeadLocations.id} = ${created.id}`);
  const updated = await storage.upsertPrimaryLocation(lead.id, { addressLine1: "2 Elm St", isPrimary: true });
  expect(updated.geofenceRadiusMeters).toBe(60);

  const other = (await db.execute(sql`
    INSERT INTO sales_leads (organization_id, name) VALUES (${org.id}, 'Fresh Co') RETURNING id
  `)).rows[0] as { id: number };
  const inserted = await storage.upsertPrimaryLocation(other.id, { addressLine1: "3 Elm St", isPrimary: true });
  expect(inserted.geofenceRadiusMeters).toBe(275);

  // Transactional create paths (route publishing, prepare-check-in) insert directly.
  const [direct] = await db.insert(salesLeadLocations)
    .values({ leadId: other.id, addressLine1: "4 Elm St", isPrimary: false, geofenceRadiusMeters: defaultGeofenceRadiusSql() })
    .returning();
  expect(direct.geofenceRadiusMeters).toBe(275);
});
