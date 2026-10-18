import { sql, type SQL } from "drizzle-orm";
import { TAG_STOCK_METRICS, type StockMetricRule, type TagStockMetric } from "#shared/tagMetrics.js";

// The stock numbers of shared/tagMetrics.ts as SQL conditions on a `tags` row,
// so every query counts a metric exactly the way the app does
// (matchesStockMetric). `alias` is the tags table alias in the query.

export function stockRuleSql(rule: StockMetricRule, alias = "t"): SQL {
  const t = sql.raw(alias);
  const conds: SQL[] = [];
  if (rule.holder === "house") conds.push(sql`${t}.rep_id IS NULL`);
  if (rule.holder === "rep") conds.push(sql`${t}.rep_id IS NOT NULL`);
  if (rule.stockStatus) conds.push(sql`${t}.stock_status = ${rule.stockStatus}`);
  if (rule.status) conds.push(sql`${t}.status = ${rule.status}`);
  if (rule.notRetired) conds.push(sql`${t}.status <> 'retired'`);
  if (rule.sold !== undefined) {
    const sale = sql`EXISTS (SELECT 1 FROM sales_sale_tags metric_sale WHERE metric_sale.tag_id = ${t}.id AND metric_sale.status = 'active')`;
    conds.push(rule.sold ? sale : sql`NOT ${sale}`);
  }
  return conds.length ? sql`(${sql.join(conds, sql` AND `)})` : sql`true`;
}

export function stockMetricSql(metric: TagStockMetric, alias = "t"): SQL {
  return stockRuleSql(TAG_STOCK_METRICS[metric], alias);
}

/** `count(*) FILTER (WHERE <metric>)::int`, for aggregate queries over `tags <alias>`. */
export function countMetricSql(metric: TagStockMetric, alias = "t"): SQL {
  return sql`count(${sql.raw(alias)}.id) FILTER (WHERE ${stockMetricSql(metric, alias)})::int`;
}
