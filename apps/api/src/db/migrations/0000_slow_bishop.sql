CREATE TYPE "public"."audit_action" AS ENUM('LOGIN', 'VIEW', 'CREATE', 'UPDATE', 'AI_RUN', 'REVIEW', 'RETURN', 'APPROVE', 'REJECT', 'ARCHIVE', 'REVALIDATE', 'PERMISSION_CHANGE', 'CONFIG_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('draft', 'ai_processed', 'review_pending', 'returned', 'approved', 'rejected', 'revalidation_required', 'archived');--> statement-breakpoint
CREATE TYPE "public"."outcome_type" AS ENUM('success', 'failure', 'mixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('pending', 'approved', 'returned', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'contributor', 'reviewer', 'approver', 'admin');--> statement-breakpoint
CREATE TYPE "public"."usage_event_type" AS ENUM('search_hit', 'view', 'reuse', 'citation');--> statement-breakpoint
CREATE TABLE "ai_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid,
	"model_id" varchar(120) NOT NULL,
	"model_version" varchar(60) NOT NULL,
	"prompt_version" varchar(60) NOT NULL,
	"input_source_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"output_hash" varchar(64),
	"latency_ms" integer,
	"review_result" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"role" varchar(30),
	"action" "audit_action" NOT NULL,
	"object_type" varchar(60) NOT NULL,
	"object_id" varchar(80),
	"before_version" integer,
	"after_version" integer,
	"reason" text,
	"correlation_id" varchar(64),
	"source_ip" varchar(60)
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"location_type" varchar(40) DEFAULT 'document' NOT NULL,
	"page" integer,
	"section" varchar(200),
	"quote_hash" varchar(64),
	"source_version" integer DEFAULT 1 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "knowledge_status" DEFAULT 'draft' NOT NULL,
	"project_site" varchar(200),
	"work_category" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"issue" text NOT NULL,
	"cause" text,
	"action" text,
	"result" text,
	"outcome_type" "outcome_type" DEFAULT 'unknown' NOT NULL,
	"applicable_conditions" text,
	"exclusion_conditions" text,
	"standards_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"ai_confidence" real,
	"ai_output" jsonb,
	"reviewer_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"approver_id" uuid,
	"approved_at" timestamp with time zone,
	"superseded_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"assigned_to" uuid,
	"decision" "review_decision" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"reason" text,
	"escalated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"source_type" varchar(60) DEFAULT 'manual' NOT NULL,
	"origin_system" varchar(120) DEFAULT 'web' NOT NULL,
	"original_uri" text,
	"content_text" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"project_site" varchar(200),
	"work_category" text[] DEFAULT '{}'::text[] NOT NULL,
	"confidentiality" varchar(30) DEFAULT 'internal' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid,
	"user_id" uuid,
	"event_type" "usage_event_type" NOT NULL,
	"correlation_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"department" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_links" ADD CONSTRAINT "knowledge_source_links_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_links" ADD CONSTRAINT "knowledge_source_links_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;