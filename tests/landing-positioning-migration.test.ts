import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { defaultLandingContent } from "../client/src/lib/landingContent";
import { LANDING_LOCALES, landingPageContentSchema } from "../shared/landingContent";

describe("landing positioning migration", () => {
  it("updates published copy without replacing unrelated admin content", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE landing_page_contents (
        locale TEXT PRIMARY KEY,
        content JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    for (const locale of LANDING_LOCALES) {
      const content = defaultLandingContent(locale);
      content.navigation.audience = `preserved-${locale}`;
      await db.query(
        `INSERT INTO landing_page_contents (locale, content) VALUES ($1, $2::jsonb)`,
        [locale, JSON.stringify(content)],
      );
    }

    const migration = readFileSync(
      new URL("../migrations/0047_expand_landing_beyond_side_hustles.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);

    const result = await db.query<{ locale: string; content: unknown }>(
      `SELECT locale, content FROM landing_page_contents ORDER BY locale`,
    );
    for (const row of result.rows) {
      const content = landingPageContentSchema.parse(row.content);
      expect(content.navigation.audience).toBe(`preserved-${row.locale}`);
      expect(JSON.stringify(content)).not.toMatch(/side hustle|renda extra|ingresos extra/i);
      expect(content.audience.subtitle).toMatch(/full-time|atividade principal|actividad principal/i);
    }

    await db.close();
  });
});
