export interface DatabaseColumn {
  column_name: string;
  data_type: string;
  is_generated: string;
  identity_generation: string | null;
  is_nullable: string;
  column_default: string | null;
}

const XPOT_EXACT_TABLES = new Set([
  "app_branding",
  "landing_page_contents",
  "organizations",
  "organization_audit_log",
  "organization_memberships",
  "tags",
  "xphere_integrations",
]);

const XPOT_TABLE_PREFIXES = ["mcp_", "prospecting_", "sales_", "tag_"];

/**
 * The Supabase development database is shared with other Skale Club products.
 * Only Xpot-owned business tables may be replaced by the production snapshot.
 * Authentication, sessions and shared integration settings intentionally stay
 * local so the developer remains signed in and unrelated tenant data is safe.
 */
export function isXpotDataTable(table: string): boolean {
  return XPOT_EXACT_TABLES.has(table) || XPOT_TABLE_PREFIXES.some((prefix) => table.startsWith(prefix));
}

/** Columns that production cannot supply and Postgres cannot fill locally. */
export function missingRequiredColumns(local: DatabaseColumn[], production: DatabaseColumn[]): string[] {
  const productionNames = new Set(production.map((column) => column.column_name));
  return local
    .filter((column) =>
      !productionNames.has(column.column_name) &&
      column.is_generated !== "ALWAYS" &&
      !column.identity_generation &&
      column.is_nullable === "NO" &&
      column.column_default === null,
    )
    .map((column) => column.column_name);
}
