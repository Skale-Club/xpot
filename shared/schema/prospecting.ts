import { boolean, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { salesLeads, salesReps, salesVisits } from "./sales.js";

export const prospectingJobStatusEnum = pgEnum("prospecting_job_status", [
  "draft",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const prospectingCandidateStatusEnum = pgEnum("prospecting_candidate_status", [
  "discovered",
  "shortlisted",
  "scheduled",
  "visited",
  "discarded",
]);

export const prospectingRunStatusEnum = pgEnum("prospecting_run_status", [
  "queued",
  "starting",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const prospectingRouteStatusEnum = pgEnum("prospecting_route_status", [
  "draft",
  "published",
  "in_progress",
  "completed",
  "cancelled",
]);

export const prospectingStopStatusEnum = pgEnum("prospecting_stop_status", [
  "planned",
  "en_route",
  "checked_in",
  "completed",
  "skipped",
  "rescheduled",
]);

export type ProspectingSearchSpec = { niche: string; query: string };
export type ProspectingJobStatus = typeof prospectingJobStatusEnum.enumValues[number];
export type ProspectingRunStatus = typeof prospectingRunStatusEnum.enumValues[number];
export type ProspectingRouteStatus = typeof prospectingRouteStatusEnum.enumValues[number];
export type ProspectingStopStatus = typeof prospectingStopStatusEnum.enumValues[number];

export const prospectingJobs = pgTable("prospecting_jobs", {
  id: serial("id").primaryKey(),
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "cascade" }).notNull(),
  status: prospectingJobStatusEnum("status").notNull().default("draft"),
  executor: text("executor").notNull().default("google_maps_engine"),
  location: text("location").notNull(),
  searches: jsonb("searches").$type<ProspectingSearchSpec[]>().notNull().default([]),
  maxResultsPerSearch: integer("max_results_per_search").notNull().default(30),
  targetStops: integer("target_stops").notNull().default(12),
  shiftDurationMinutes: integer("shift_duration_minutes").notNull().default(480),
  defaultVisitMinutes: integer("default_visit_minutes").notNull().default(20),
  autoExpand: boolean("auto_expand").notNull().default(true),
  maxExpansionKm: integer("max_expansion_km").notNull().default(30),
  expansionState: jsonb("expansion_state").$type<Record<string, unknown>>().notNull().default({}),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  hypothesis: jsonb("hypothesis").$type<Record<string, unknown> | null>(),
  resultCount: integer("result_count").notNull().default(0),
  idempotencyKey: text("idempotency_key"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  repIdx: index("prospecting_jobs_rep_idx").on(table.repId, table.createdAt),
  statusIdx: index("prospecting_jobs_status_idx").on(table.status),
  repIdempotencyIdx: uniqueIndex("prospecting_jobs_rep_idempotency_unique").on(table.repId, table.idempotencyKey),
}));

export const prospectingRuns = pgTable("prospecting_runs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => prospectingJobs.id, { onDelete: "cascade" }).notNull(),
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "cascade" }).notNull(),
  status: prospectingRunStatusEnum("status").notNull().default("queued"),
  niche: text("niche").notNull(),
  query: text("query").notNull(),
  location: text("location").notNull(),
  requestedMaxResults: integer("requested_max_results").notNull().default(30),
  wave: integer("wave").notNull().default(0),
  expansionReason: text("expansion_reason"),
  engineJobId: text("engine_job_id"),
  engineInput: jsonb("engine_input").$type<Record<string, unknown>>().notNull().default({}),
  progress: integer("progress").notNull().default(0),
  resultCount: integer("result_count").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  queueIdx: index("prospecting_runs_queue_idx").on(table.status, table.createdAt),
  jobIdx: index("prospecting_runs_job_idx").on(table.jobId, table.createdAt),
  engineJobIdx: uniqueIndex("prospecting_runs_engine_job_unique").on(table.engineJobId),
  areaSearchIdx: uniqueIndex("prospecting_runs_job_niche_area_unique").on(table.jobId, table.niche, table.location),
}));

export const prospectingCandidates = pgTable("prospecting_candidates", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => prospectingJobs.id, { onDelete: "cascade" }).notNull(),
  runId: integer("run_id").references(() => prospectingRuns.id, { onDelete: "cascade" }).notNull(),
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "cascade" }).notNull(),
  leadId: integer("lead_id").references(() => salesLeads.id, { onDelete: "set null" }),
  status: prospectingCandidateStatusEnum("status").notNull().default("discovered"),
  sourceId: text("source_id"),
  googlePlaceId: text("google_place_id"),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("US"),
  lat: text("lat"),
  lng: text("lng"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  industry: text("industry"),
  ratingPermille: integer("rating_permille"),
  reviewCount: integer("review_count"),
  score: integer("score").notNull().default(0),
  scoreReasons: jsonb("score_reasons").$type<string[]>().notNull().default([]),
  exclusionReason: text("exclusion_reason"),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  jobIdx: index("prospecting_candidates_job_idx").on(table.jobId, table.status),
  repIdx: index("prospecting_candidates_rep_idx").on(table.repId, table.status),
  jobSourceIdx: uniqueIndex("prospecting_candidates_job_source_unique").on(table.jobId, table.sourceId),
}));

export const prospectingRoutes = pgTable("prospecting_routes", {
  id: serial("id").primaryKey(),
  repId: integer("rep_id").references(() => salesReps.id, { onDelete: "cascade" }).notNull(),
  jobId: integer("job_id").references(() => prospectingJobs.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  routeDate: text("route_date").notNull(),
  status: prospectingRouteStatusEnum("status").notNull().default("draft"),
  optimizer: text("optimizer").notNull().default("heuristic_v1"),
  plannedStartAt: timestamp("planned_start_at").notNull(),
  plannedEndAt: timestamp("planned_end_at"),
  startAddress: text("start_address"),
  startLat: text("start_lat").notNull(),
  startLng: text("start_lng").notNull(),
  endAddress: text("end_address"),
  endLat: text("end_lat"),
  endLng: text("end_lng"),
  maxStops: integer("max_stops").notNull().default(12),
  defaultVisitMinutes: integer("default_visit_minutes").notNull().default(20),
  totalDistanceMeters: integer("total_distance_meters").notNull().default(0),
  totalDurationSeconds: integer("total_duration_seconds").notNull().default(0),
  optimizationMeta: jsonb("optimization_meta").$type<Record<string, unknown>>().notNull().default({}),
  publishedAt: timestamp("published_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  repDateIdx: index("prospecting_routes_rep_date_idx").on(table.repId, table.routeDate),
  statusIdx: index("prospecting_routes_status_idx").on(table.status),
  activeJobDateIdx: uniqueIndex("prospecting_routes_active_job_date_unique")
    .on(table.repId, table.jobId, table.routeDate)
    .where(sql`${table.jobId} is not null and ${table.status} <> 'cancelled'`),
}));

export const prospectingRouteStops = pgTable("prospecting_route_stops", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").references(() => prospectingRoutes.id, { onDelete: "cascade" }).notNull(),
  candidateId: integer("candidate_id").references(() => prospectingCandidates.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => salesLeads.id, { onDelete: "set null" }),
  visitId: integer("visit_id").references(() => salesVisits.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  status: prospectingStopStatusEnum("status").notNull().default("planned"),
  name: text("name").notNull(),
  address: text("address"),
  lat: text("lat").notNull(),
  lng: text("lng").notNull(),
  score: integer("score").notNull().default(0),
  scoreReasons: jsonb("score_reasons").$type<string[]>().notNull().default([]),
  serviceDurationSeconds: integer("service_duration_seconds").notNull().default(1200),
  travelDistanceMeters: integer("travel_distance_meters").notNull().default(0),
  travelDurationSeconds: integer("travel_duration_seconds").notNull().default(0),
  estimatedArrivalAt: timestamp("estimated_arrival_at"),
  skipReason: text("skip_reason"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  routePositionIdx: uniqueIndex("prospecting_route_stops_position_unique").on(table.routeId, table.position),
  routeStatusIdx: index("prospecting_route_stops_route_status_idx").on(table.routeId, table.status),
}));

export type ProspectingJob = typeof prospectingJobs.$inferSelect;
export type ProspectingRun = typeof prospectingRuns.$inferSelect;
export type ProspectingCandidate = typeof prospectingCandidates.$inferSelect;
export type ProspectingRoute = typeof prospectingRoutes.$inferSelect;
export type ProspectingRouteStop = typeof prospectingRouteStops.$inferSelect;
