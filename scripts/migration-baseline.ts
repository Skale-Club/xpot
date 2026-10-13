export type SchemaColumn = { table_name: string; column_name: string };

const LEAD_MODEL_SIGNATURE = [
  "sales_leads.id",
  "sales_lead_locations.lead_id",
  "sales_lead_contacts.lead_id",
  "sales_visits.lead_id",
  "sales_opportunities_local.lead_id",
  "sales_tasks.lead_id",
] as const;

const SUPERSEDED_SALES_MIGRATIONS = [
  "0001_create_sales_schema.sql",
  "0003_refactor_accounts_to_leads.sql",
] as const;

/**
 * Databases created before the migration ledger already used the final leads
 * model. Replaying 0001 fails on renamed columns, while replaying 0003 would
 * drop populated sales tables. Recognize only the complete post-0003 schema;
 * an ambiguous/partial schema deliberately returns no baseline and fails safe.
 */
export function inferLegacySalesBaseline(columns: SchemaColumn[], applied: ReadonlySet<string>): string[] {
  const present = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
  const isLeadModel = LEAD_MODEL_SIGNATURE.every((column) => present.has(column));
  const hasOldAccountModel = present.has("sales_accounts.id") || present.has("sales_visits.account_id");
  if (!isLeadModel || hasOldAccountModel) return [];
  return SUPERSEDED_SALES_MIGRATIONS.filter((migration) => !applied.has(migration));
}
