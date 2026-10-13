import { describe, expect, it } from "vitest";
import { inferLegacySalesBaseline, type SchemaColumn } from "../scripts/migration-baseline.js";

const column = (table_name: string, column_name: string): SchemaColumn => ({ table_name, column_name });

const convertedSchema: SchemaColumn[] = [
  column("sales_leads", "id"),
  column("sales_lead_locations", "lead_id"),
  column("sales_lead_contacts", "lead_id"),
  column("sales_visits", "lead_id"),
  column("sales_opportunities_local", "lead_id"),
  column("sales_tasks", "lead_id"),
];

describe("legacy migration baseline", () => {
  it("baselines the superseded migrations for a complete converted leads schema", () => {
    expect(inferLegacySalesBaseline(convertedSchema, new Set())).toEqual([
      "0001_create_sales_schema.sql",
      "0003_refactor_accounts_to_leads.sql",
    ]);
  });

  it("does not baseline an ambiguous partial schema", () => {
    expect(inferLegacySalesBaseline(convertedSchema.slice(0, -1), new Set())).toEqual([]);
  });

  it("does not baseline while the old account model is still present", () => {
    expect(inferLegacySalesBaseline([...convertedSchema, column("sales_visits", "account_id")], new Set())).toEqual([]);
  });

  it("returns only migration records that are still missing", () => {
    expect(inferLegacySalesBaseline(convertedSchema, new Set(["0001_create_sales_schema.sql"]))).toEqual([
      "0003_refactor_accounts_to_leads.sql",
    ]);
  });
});
