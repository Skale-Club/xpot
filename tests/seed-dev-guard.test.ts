import { describe, expect, it } from "vitest";
import { APPROVED_DEV_PROJECT, seedDatabaseUrl } from "../scripts/seed-dev-guard.js";

const pooler = `postgresql://postgres.${APPROVED_DEV_PROJECT}:pw@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

describe("db:seed:dev target guard", () => {
  it("accepts Xpot's development Supabase project", () => {
    expect(seedDatabaseUrl({ DEV_DATABASE_URL: pooler, DEV_SUPABASE_PROJECT_REF: APPROVED_DEV_PROJECT })).toBe(pooler);
  });

  it("refuses NODE_ENV=production", () => {
    expect(() =>
      seedDatabaseUrl({ NODE_ENV: "production", DEV_DATABASE_URL: pooler, DEV_SUPABASE_PROJECT_REF: APPROVED_DEV_PROJECT }),
    ).toThrow(/production/);
  });

  it("refuses any other Supabase project, even a valid one", () => {
    const other = "neummispnnqzrhdhnxwa";
    expect(() =>
      seedDatabaseUrl({
        DEV_DATABASE_URL: `postgresql://postgres.${other}:pw@aws-1-us-east-1.pooler.supabase.com:5432/postgres`,
        DEV_SUPABASE_PROJECT_REF: other,
      }),
    ).toThrow(/only Xpot's development project/);
  });

  it("refuses a URL that is not the approved project (e.g. production xpot-db)", () => {
    expect(() =>
      seedDatabaseUrl({ DEV_DATABASE_URL: "postgresql://xpot:pw@10.0.1.5:5432/xpot", DEV_SUPABASE_PROJECT_REF: APPROVED_DEV_PROJECT }),
    ).toThrow(/does not match/);
  });

  it("never falls back to DATABASE_URL", () => {
    expect(() =>
      seedDatabaseUrl({ DATABASE_URL: pooler, POSTGRES_URL: pooler, DEV_SUPABASE_PROJECT_REF: APPROVED_DEV_PROJECT }),
    ).toThrow(/DEV_DATABASE_URL/);
  });
});
