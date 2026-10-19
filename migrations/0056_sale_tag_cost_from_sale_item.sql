-- A piece linked to a sale recorded elsewhere (Visits) takes the cost the sale
-- item froze when it was sold: cost_source 'sale_item'. Idempotent.

ALTER TABLE "sales_sale_tags" DROP CONSTRAINT IF EXISTS "sales_sale_tags_cost_source_check";
ALTER TABLE "sales_sale_tags" ADD CONSTRAINT "sales_sale_tags_cost_source_check"
  CHECK ("cost_source" IN ('policy_zero', 'manual_override', 'acquisition', 'sale_item'));
