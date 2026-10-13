import { describe, expect, it } from "vitest";
import { isXpotDataTable, missingRequiredColumns, type DatabaseColumn } from "../scripts/db-pull-schema.js";

function column(name: string, overrides: Partial<DatabaseColumn> = {}): DatabaseColumn {
  return {
    column_name: name,
    data_type: "text",
    is_generated: "NEVER",
    identity_generation: null,
    is_nullable: "YES",
    column_default: null,
    ...overrides,
  };
}

describe("production data pull scope", () => {
  it("copies Xpot business data but excludes shared-product and authentication tables", () => {
    for (const table of ["app_branding", "organizations", "sales_leads", "tag_batches", "tags", "prospecting_routes", "mcp_tokens"]) {
      expect(isXpotDataTable(table)).toBe(true);
    }
    for (const table of ["users", "sessions", "auth_phone_codes", "auth_access_requests", "chat_integrations", "integration_settings", "tenants", "blog_posts"]) {
      expect(isXpotDataTable(table)).toBe(false);
    }
  });

  it("detects required local columns that an older production schema cannot populate", () => {
    const local = [
      column("id", { is_nullable: "NO" }),
      column("tenant_id", { is_nullable: "NO" }),
      column("optional_note"),
      column("status", { is_nullable: "NO", column_default: "'active'::text" }),
    ];
    const production = [column("id", { is_nullable: "NO" })];
    expect(missingRequiredColumns(local, production)).toEqual(["tenant_id"]);
  });
});
