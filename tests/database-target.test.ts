import { describe, expect, it } from "vitest";
import { describeDatabaseTarget, ignoredDatabaseOverride, resolveDatabaseUrl } from "../server/lib/database-target.js";

const project = "developmentproject";
const devUrl = `postgresql://postgres.${project}:test-secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;
const development = { NODE_ENV: "development", DEV_DATABASE_URL: devUrl, DEV_SUPABASE_PROJECT_REF: project };

describe("development and production database separation", () => {
  it("uses the explicitly selected development database even with production aliases present", () => {
    expect(resolveDatabaseUrl({ ...development, DATABASE_URL: "postgres://prod/db", POSTGRES_URL: "postgres://other/db" })).toBe(devUrl);
  });
  it("accepts a direct connection only for the approved project", () => {
    const url = `postgres://postgres:test-secret@db.${project}.supabase.co/postgres`;
    expect(resolveDatabaseUrl({ ...development, DEV_DATABASE_URL: url })).toBe(url);
  });
  it.each([
    { DEV_DATABASE_URL: undefined },
    { DEV_SUPABASE_PROJECT_REF: undefined },
    { DEV_SUPABASE_PROJECT_REF: "otherproject" },
    { DEV_DATABASE_URL: devUrl.replace(":5432/", ":6543/") },
    { DEV_DATABASE_URL: "not-a-url" },
    { DEV_DATABASE_URL: "postgres://postgres:secret@localhost/prod" },
    { DEV_DATABASE_URL: `postgres://postgres.${project}:secret@supabase.example.com/prod` },
    { DEV_DATABASE_URL: `postgres://postgres.${project}:secret@aws-1.pooler.supabase.com.evil.test/prod` },
    { DEV_DATABASE_URL: `https://postgres.${project}:secret@aws-1.pooler.supabase.com/prod` },
    { DEV_DATABASE_URL: `${devUrl}?sslmode=disable` },
    { PGSSLMODE: "disable" },
  ])("rejects unsafe development configuration without exposing credentials: %j", (override) => {
    expect(() => resolveDatabaseUrl({ ...development, ...override })).toThrow();
    try { resolveDatabaseUrl({ ...development, ...override }); }
    catch (error) { expect((error as Error).message).not.toContain("test-secret"); }
  });
  it("never falls back to a production URL when development is unconfigured", () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: devUrl })).toThrow("Development requires");
  });
  it("leaves production precedence and private-network connections unchanged", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "postgres://private/db?sslmode=disable", POSTGRES_URL: devUrl, ...{ DEV_DATABASE_URL: devUrl } })).toBe("postgres://private/db?sslmode=disable");
    expect(resolveDatabaseUrl({ NODE_ENV: "production", POSTGRES_URL: "postgres://private/db" })).toBe("postgres://private/db");
  });
  it("preserves test database configuration", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: "postgres://disposable/test" })).toBe("postgres://disposable/test");
  });
});

describe("a database typed in the shell that development would ignore", () => {
  const disposable = "postgresql://postgres@localhost:55432/xpot_ci?sslmode=disable";
  it("names DATABASE_URL or POSTGRES_URL set in the shell when development would migrate DEV_DATABASE_URL instead", () => {
    expect(ignoredDatabaseOverride({ DATABASE_URL: disposable }, { ...development, DATABASE_URL: disposable })).toBe("DATABASE_URL");
    expect(ignoredDatabaseOverride({ POSTGRES_URL: disposable }, { ...development, POSTGRES_URL: disposable })).toBe("POSTGRES_URL");
  });
  it("leaves alone the aliases written in .env, the dev URL itself, and every other environment", () => {
    expect(ignoredDatabaseOverride({}, { ...development, DATABASE_URL: "postgres://prod/db", POSTGRES_URL: devUrl })).toBeNull();
    expect(ignoredDatabaseOverride({ DATABASE_URL: devUrl }, { ...development, DATABASE_URL: devUrl })).toBeNull();
    expect(ignoredDatabaseOverride({ DATABASE_URL: disposable }, { NODE_ENV: "test", DATABASE_URL: disposable })).toBeNull();
    expect(ignoredDatabaseOverride({ DATABASE_URL: disposable }, { NODE_ENV: "production", DATABASE_URL: disposable })).toBeNull();
  });
  it("describes where a run goes without the user or password", () => {
    const dev = describeDatabaseTarget(devUrl, development);
    expect(dev).toBe(`the Supabase development database, project ${project} (aws-1-us-east-1.pooler.supabase.com:5432/postgres)`);
    expect(dev).not.toContain("test-secret");
    expect(describeDatabaseTarget(disposable, { NODE_ENV: "test" })).toBe("localhost:55432/xpot_ci");
    expect(describeDatabaseTarget("not a url", { NODE_ENV: "test" })).toBe("an unreadable database URL");
  });
});
