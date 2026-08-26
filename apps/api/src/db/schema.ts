import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  real,
  jsonb,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * ロール定義は 詳細仕様設計書 §13 権限・認可設計 のマトリクスに対応する。
 * user: 一般利用者 / contributor: 一次情報登録・知見編集 / reviewer: 技術レビュー担当
 * approver: 専門分野責任者(正式承認権限) / admin: システム管理者
 */
export const roleEnum = pgEnum("role", [
  "user",
  "contributor",
  "reviewer",
  "approver",
  "admin",
]);

/** 詳細仕様設計書 §5 ステータス・状態遷移 */
export const knowledgeStatusEnum = pgEnum("knowledge_status", [
  "draft",
  "ai_processed",
  "review_pending",
  "returned",
  "approved",
  "rejected",
  "revalidation_required",
  "archived",
]);

export const outcomeTypeEnum = pgEnum("outcome_type", [
  "success",
  "failure",
  "mixed",
  "unknown",
]);

export const reviewDecisionEnum = pgEnum("review_decision", [
  "pending",
  "approved",
  "returned",
  "rejected",
]);

/** 詳細仕様設計書 §14 監査イベント */
export const auditActionEnum = pgEnum("audit_action", [
  "LOGIN",
  "VIEW",
  "CREATE",
  "UPDATE",
  "AI_RUN",
  "REVIEW",
  "RETURN",
  "APPROVE",
  "REJECT",
  "ARCHIVE",
  "REVALIDATE",
  "PERMISSION_CHANGE",
  "CONFIG_CHANGE",
]);

export const usageEventEnum = pgEnum("usage_event_type", [
  "search_hit",
  "view",
  "reuse",
  "citation",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 200 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  department: varchar("department", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** SourceDocument: 一次情報の原文。AI生成で上書きしない (詳細仕様設計書 C02) */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  sourceType: varchar("source_type", { length: 60 }).notNull().default("manual"),
  originSystem: varchar("origin_system", { length: 120 }).notNull().default("web"),
  originalUri: text("original_uri"),
  contentText: text("content_text").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  projectSite: varchar("project_site", { length: 200 }),
  workCategory: text("work_category").array().notNull().default(sql`'{}'::text[]`),
  confidentiality: varchar("confidentiality", { length: 30 }).notNull().default("internal"),
  version: integer("version").notNull().default(1),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * KnowledgeCandidate / ApprovedKnowledge は状態(status)で区別する共通スキーマ
 * (詳細仕様設計書 §4.1)。承認前後で物理テーブルを分けず、status=approved のみを
 * 正式知見として検索・API上で優先露出させることで論理分離を実現する。
 */
export const knowledgeItems = pgTable("knowledge_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  version: integer("version").notNull().default(1),
  status: knowledgeStatusEnum("status").notNull().default("draft"),
  projectSite: varchar("project_site", { length: 200 }),
  workCategory: text("work_category").array().notNull().default(sql`'{}'::text[]`),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  issue: text("issue").notNull(),
  cause: text("cause"),
  action: text("action"),
  result: text("result"),
  outcomeType: outcomeTypeEnum("outcome_type").notNull().default("unknown"),
  applicableConditions: text("applicable_conditions"),
  exclusionConditions: text("exclusion_conditions"),
  standardsRefs: text("standards_refs").array().notNull().default(sql`'{}'::text[]`),
  aiConfidence: real("ai_confidence"),
  /** facts/inferences/unknowns/evidence_refs/conflicts/review_questions (§7 必須出力フォーマット) */
  aiOutput: jsonb("ai_output"),
  reviewerIds: text("reviewer_ids").array().notNull().default(sql`'{}'::text[]`),
  approverId: uuid("approver_id").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  supersededBy: uuid("superseded_by"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** knowledge_items <-> sources の根拠関係 (source_ids[]) */
export const knowledgeSourceLinks = pgTable("knowledge_source_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeId: uuid("knowledge_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").notNull().references(() => sources.id),
});

/** EvidenceLink (詳細仕様設計書 §4.2) */
export const evidenceLinks = pgTable("evidence_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeId: uuid("knowledge_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").notNull().references(() => sources.id),
  locationType: varchar("location_type", { length: 40 }).notNull().default("document"),
  page: integer("page"),
  section: varchar("section", { length: 200 }),
  quoteHash: varchar("quote_hash", { length: 64 }),
  sourceVersion: integer("source_version").notNull().default(1),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** ReviewCase: レビュー依頼〜判断の記録 */
export const reviewCases = pgTable("review_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeId: uuid("knowledge_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  decision: reviewDecisionEnum("decision").notNull().default("pending"),
  comment: text("comment"),
  reason: text("reason"),
  escalated: boolean("escalated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by").references(() => users.id),
});

/** UsageEvent: 検索・閲覧・引用・再利用 (KPI §11/§16 の基礎データ) */
export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeId: uuid("knowledge_id").references(() => knowledgeItems.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  eventType: usageEventEnum("event_type").notNull(),
  correlationId: varchar("correlation_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** AIExecution: モデル・プロンプト版・入出力の追跡 (§15 AI実行記録) */
export const aiExecutions = pgTable("ai_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeId: uuid("knowledge_id").references(() => knowledgeItems.id, { onDelete: "cascade" }),
  modelId: varchar("model_id", { length: 120 }).notNull(),
  modelVersion: varchar("model_version", { length: 60 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 60 }).notNull(),
  inputSourceIds: text("input_source_ids").array().notNull().default(sql`'{}'::text[]`),
  outputHash: varchar("output_hash", { length: 64 }),
  latencyMs: integer("latency_ms"),
  reviewResult: varchar("review_result", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** AuditLog (詳細仕様設計書 §14 監査ログ項目) — 追記型・原則不変 */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid("actor_id").references(() => users.id),
  role: varchar("role", { length: 30 }),
  action: auditActionEnum("action").notNull(),
  objectType: varchar("object_type", { length: 60 }).notNull(),
  objectId: varchar("object_id", { length: 80 }),
  beforeVersion: integer("before_version"),
  afterVersion: integer("after_version"),
  reason: text("reason"),
  correlationId: varchar("correlation_id", { length: 64 }),
  sourceIp: varchar("source_ip", { length: 60 }),
});
