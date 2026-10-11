import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

// Replays the production order: the database had every migration up to 0027 (and 0030) when 0028, 0029 and 0031
// arrive with the stock model. Batches made before then had their codes issued by Xpot; two of them (REV-2026-003,
// LPLATE-2026-002) were not printed yet, so their pieces must come out `pending`, not sellable stock.
const files = readdirSync(join(process.cwd(), "migrations")).filter((f) => f.endsWith(".sql")).sort();
const sqlOf = (file: string) => readFileSync(join(process.cwd(), "migrations", file), "utf8");
const STOCK = ["0028", "0029", "0031"];

describe("stock migrations on existing batches", () => {
  it("keeps printed batches as stock and makes the unprinted ones pending and open", async () => {
    const db = new PGlite();
    const q = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows as any[];
    await db.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
    for (const file of files.filter((f) => !STOCK.some((n) => f.startsWith(n)))) await db.exec(sqlOf(file));

    const [{ id: org }] = await q(`INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-co') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = async (code: string, n: number) => {
      const [{ id }] = await q(
        `INSERT INTO tag_batches (batch_code, name, product_type, quantity, status) VALUES ($1, $1, 'large_plate', $2, 'generated') RETURNING id`,
        [code, n],
      );
      for (let i = 1; i <= n; i++) {
        await q(
          `INSERT INTO tags (organization_id, public_code, serial_number, batch_id, product_type, status) VALUES ($1, $2, $3, $4, 'large_plate', 'inventory')`,
          [org, `${code.replace(/[^A-Z0-9]/g, "").slice(-6)}${i}X`.slice(0, 8).padEnd(8, "Z"), i, id],
        );
      }
      return id;
    };
    const printed = await batch("LPLATE-2026-001", 2);
    const unprinted = await batch("LPLATE-2026-002", 2);
    const activeUnprinted = await batch("REV-2026-003", 2);
    // A piece of an "unprinted" batch that was already activated must keep its state (never happens today; guards the WHERE).
    await q(
      `UPDATE tags SET status = 'active', destination_type = 'google_review', destination_url = 'https://g.page/r/x/review'
       WHERE batch_id = $1 AND serial_number = 2`,
      [activeUnprinted],
    );

    for (const file of files.filter((f) => STOCK.some((n) => f.startsWith(n)))) await db.exec(sqlOf(file));

    const byBatch = async (id: string) =>
      q(`SELECT serial_number, stock_status, registered_at IS NOT NULL AS registered FROM tags WHERE batch_id = $1 ORDER BY serial_number`, [id]);
    expect(await byBatch(printed)).toEqual([
      { serial_number: 1, stock_status: "available", registered: true },
      { serial_number: 2, stock_status: "available", registered: true },
    ]);
    expect(await byBatch(unprinted)).toEqual([
      { serial_number: 1, stock_status: "pending", registered: false },
      { serial_number: 2, stock_status: "pending", registered: false },
    ]);
    expect((await byBatch(activeUnprinted)).map((t) => t.stock_status)).toEqual(["pending", "available"]);

    const batches = await q(`SELECT batch_code, status, code_source FROM tag_batches ORDER BY batch_code`);
    expect(batches).toEqual([
      { batch_code: "LPLATE-2026-001", status: "closed", code_source: "issued" },
      { batch_code: "LPLATE-2026-002", status: "open", code_source: "issued" },
      { batch_code: "REV-2026-003", status: "open", code_source: "issued" },
    ]);

    // Every piece has a movement history that explains its current stock state.
    const unexplained = await q(`
      SELECT t.public_code FROM tags t
      WHERE t.stock_status <> (SELECT m.to_stock_status FROM tag_stock_movements m WHERE m.tag_id = t.id ORDER BY m.created_at DESC, m.movement_type = 'adjustment' DESC LIMIT 1)
    `);
    expect(unexplained).toEqual([]);
    await db.close();
  });
});
