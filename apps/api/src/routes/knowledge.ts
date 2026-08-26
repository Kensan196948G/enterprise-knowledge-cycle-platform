import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  knowledgeItems,
  knowledgeSourceLinks,
  sources,
  evidenceLinks,
  reviewCases,
  aiExecutions,
  usageEvents,
} from "../db/schema.js";
import { authGuard, requireRole } from "../middleware/auth-guard.js";
import { permissions } from "../lib/rbac.js";
import { runAiStructuring } from "../lib/ai-structuring.js";
import { recordAudit } from "../lib/audit.js";

export const knowledgeRoutes = new Hono();

knowledgeRoutes.use("*", authGuard);

const createCandidateSchema = z.object({
  sourceIds: z.array(z.string().uuid()).min(1),
  title: z.string().max(300).optional(),
});

/**
 * FR-03/FR-04 AI構造化 + 知見候補生成。
 * source本文を結合し、AI(またはルールベース)で facts/inferences/unknowns を抽出、
 * status=ai_processed の KnowledgeCandidate として保存する。
 */
knowledgeRoutes.post("/candidates", requireRole(permissions.runAiStructuring), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = createCandidateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }

  const sourceRows = await db
    .select()
    .from(sources)
    .where(inArray(sources.id, parsed.data.sourceIds));
  if (sourceRows.length === 0) {
    return c.json({ error: "対象の一次情報が見つかりません" }, 404);
  }

  const combinedText = sourceRows.map((s) => `【${s.title}】\n${s.contentText}`).join("\n\n");
  const structured = await runAiStructuring(
    combinedText,
    sourceRows.map((s) => s.id),
  );

  const [created] = await db
    .insert(knowledgeItems)
    .values({
      title: parsed.data.title ?? sourceRows[0].title,
      status: "ai_processed",
      projectSite: sourceRows[0].projectSite,
      workCategory: structured.fields.workCategory,
      tags: structured.fields.tags,
      issue: structured.fields.issue,
      cause: structured.fields.cause,
      action: structured.fields.action,
      result: structured.fields.result,
      outcomeType: structured.fields.outcomeType,
      applicableConditions: structured.fields.applicableConditions,
      exclusionConditions: structured.fields.exclusionConditions,
      standardsRefs: structured.fields.standardsRefs,
      aiConfidence: structured.aiConfidence,
      aiOutput: structured,
      createdBy: user.id,
    })
    .returning();

  await db.insert(knowledgeSourceLinks).values(
    sourceRows.map((s) => ({ knowledgeId: created.id, sourceId: s.id })),
  );
  await db.insert(evidenceLinks).values(
    sourceRows.map((s) => ({
      knowledgeId: created.id,
      sourceId: s.id,
      locationType: "document",
      sourceVersion: s.version,
      verified: false,
    })),
  );
  await db.insert(aiExecutions).values({
    knowledgeId: created.id,
    modelId: structured.modelId,
    modelVersion: structured.modelVersion,
    promptVersion: structured.promptVersion,
    inputSourceIds: sourceRows.map((s) => s.id),
    latencyMs: structured.latencyMs,
  });
  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "AI_RUN",
    objectType: "knowledge_item",
    objectId: created.id,
    afterVersion: created.version,
  });

  return c.json(created, 201);
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  workCategory: z.string().optional(),
  q: z.string().optional(),
});

/** 検索・絞込 (§10 検索・活用要件の一覧側)。既定では承認済みを優先表示。 */
knowledgeRoutes.get("/", async (c) => {
  const query = listQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const conditions = [];
  if (query.status) {
    conditions.push(eq(knowledgeItems.status, query.status as never));
  }
  if (query.workCategory) {
    conditions.push(sql`${query.workCategory} = ANY(${knowledgeItems.workCategory})`);
  }
  if (query.q) {
    conditions.push(
      sql`(${knowledgeItems.title} ILIKE ${"%" + query.q + "%"} OR ${knowledgeItems.issue} ILIKE ${"%" + query.q + "%"})`,
    );
  }

  const rows = await db
    .select()
    .from(knowledgeItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      sql`CASE WHEN ${knowledgeItems.status} = 'approved' THEN 0 ELSE 1 END`,
      desc(knowledgeItems.updatedAt),
    )
    .limit(200);

  return c.json({ items: rows });
});

knowledgeRoutes.get("/:id", async (c) => {
  const id = c.req.param("id") as string;
  const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  if (!item) return c.json({ error: "見つかりません" }, 404);

  const evidence = await db
    .select({
      id: evidenceLinks.id,
      sourceId: evidenceLinks.sourceId,
      locationType: evidenceLinks.locationType,
      page: evidenceLinks.page,
      section: evidenceLinks.section,
      sourceVersion: evidenceLinks.sourceVersion,
      verified: evidenceLinks.verified,
      sourceTitle: sources.title,
      sourceUri: sources.originalUri,
    })
    .from(evidenceLinks)
    .innerJoin(sources, eq(evidenceLinks.sourceId, sources.id))
    .where(eq(evidenceLinks.knowledgeId, id));

  const reviews = await db
    .select()
    .from(reviewCases)
    .where(eq(reviewCases.knowledgeId, id))
    .orderBy(desc(reviewCases.createdAt));

  const usage = await db
    .select({ eventType: usageEvents.eventType, count: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(eq(usageEvents.knowledgeId, id))
    .groupBy(usageEvents.eventType);

  await db.insert(usageEvents).values({
    knowledgeId: id,
    userId: c.get("user").id,
    eventType: "view",
  });

  return c.json({ ...item, evidence, reviews, usage });
});

const updateSchema = z.object({
  title: z.string().max(300).optional(),
  issue: z.string().optional(),
  cause: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  outcomeType: z.enum(["success", "failure", "mixed", "unknown"]).optional(),
  applicableConditions: z.string().nullable().optional(),
  exclusionConditions: z.string().nullable().optional(),
  workCategory: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  standardsRefs: z.array(z.string()).optional(),
});

/** 知見候補の人による修正 (§8 データ要件: 「人修正」を識別できること) */
knowledgeRoutes.patch("/:id", requireRole(permissions.editKnowledgeCandidate), async (c) => {
  const id = c.req.param("id") as string;
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }

  const [existing] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  if (!existing) return c.json({ error: "見つかりません" }, 404);
  if (existing.status === "approved" || existing.status === "archived") {
    return c.json({ error: "承認済み・廃止済みの知見は直接編集できません。再確認フローを使用してください。" }, 409);
  }

  const [updated] = await db
    .update(knowledgeItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(knowledgeItems.id, id))
    .returning();

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "UPDATE",
    objectType: "knowledge_item",
    objectId: id,
    beforeVersion: existing.version,
    afterVersion: updated.version,
  });

  return c.json(updated);
});

/** §9 類似知見: 同一work_categoryを共有する承認済み知見を簡易類似検索する */
knowledgeRoutes.get("/:id/similar", async (c) => {
  const id = c.req.param("id") as string;
  const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  if (!item) return c.json({ error: "見つかりません" }, 404);

  if (item.workCategory.length === 0) return c.json({ items: [] });

  const rows = await db
    .select()
    .from(knowledgeItems)
    .where(
      and(
        eq(knowledgeItems.status, "approved"),
        sql`${knowledgeItems.workCategory} && ${item.workCategory}`,
        sql`${knowledgeItems.id} != ${id}`,
      ),
    )
    .limit(10);

  return c.json({ items: rows });
});

const archiveSchema = z.object({ reason: z.string().min(1, "廃止理由は必須です") });

/** §5 状態遷移: Approved -> Archived (廃止理由必須) */
knowledgeRoutes.post("/:id/archive", requireRole(permissions.archiveOrRevalidate), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") as string;
  const body = await c.req.json().catch(() => null);
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "廃止理由は必須です" }, 400);

  const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  if (!item) return c.json({ error: "見つかりません" }, 404);
  if (item.status !== "approved") return c.json({ error: "承認済みの知見のみ廃止できます" }, 409);

  const [updated] = await db
    .update(knowledgeItems)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(knowledgeItems.id, id))
    .returning();

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "ARCHIVE",
    objectType: "knowledge_item",
    objectId: id,
    reason: parsed.data.reason,
  });
  return c.json(updated);
});

/** §5 状態遷移: Approved -> Revalidation-Required (基準版変更等) */
knowledgeRoutes.post("/:id/revalidate", requireRole(permissions.archiveOrRevalidate), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") as string;
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : "基準・根拠の版変更による再確認";

  const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  if (!item) return c.json({ error: "見つかりません" }, 404);
  if (item.status !== "approved") return c.json({ error: "承認済みの知見のみ再確認要求できます" }, 409);

  const [updated] = await db
    .update(knowledgeItems)
    .set({ status: "revalidation_required", updatedAt: new Date() })
    .where(eq(knowledgeItems.id, id))
    .returning();

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "REVALIDATE",
    objectType: "knowledge_item",
    objectId: id,
    reason,
  });
  return c.json(updated);
});
