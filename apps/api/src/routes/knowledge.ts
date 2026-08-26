import { Hono } from "hono";
import { z } from "zod";
import { and, arrayOverlaps, desc, eq, inArray, ne, sql } from "drizzle-orm";
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
import { permissions, OWNER_DELETABLE_STATUSES, APPROVER_DELETABLE_STATUSES } from "../lib/rbac.js";
import { runAiStructuring } from "../lib/ai-structuring.js";
import { recordAudit } from "../lib/audit.js";
import { getSettings } from "../lib/settings.js";
import { rankBySimilarity, rankSimilarDocs, knowledgeSearchableText } from "../lib/text-similarity.js";

function rankBySimilarityForKnowledge(
  query: string,
  candidates: (typeof knowledgeItems.$inferSelect)[],
  opts: { limit: number; minScore: number },
) {
  const ranked = rankBySimilarity(
    query,
    candidates.map((r) => ({ id: r.id, text: knowledgeSearchableText(r) })),
    opts,
  );
  const byId = new Map(candidates.map((r) => [r.id, r]));
  return ranked.map((r) => {
    const row = byId.get(r.id)!;
    return { id: row.id, title: row.title, status: row.status, score: r.score };
  });
}

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
  const settings = await getSettings();
  const structured = await runAiStructuring(
    combinedText,
    sourceRows.map((s) => s.id),
    settings?.aiModel,
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

const similarTextSchema = z.object({ text: z.string().min(1) });

/**
 * 登録画面のライブプレビュー向け: 入力中の自由記述文と類似する既存知見を
 * TF-IDF類似度で検索する(重複登録の防止・既存知見の再利用促進)。
 * rejected/archivedを除く全ステータスを対象とし、下書き段階の重複にも気づける
 * ようにする。
 */
knowledgeRoutes.post("/similar-text", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = similarTextSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "text は必須です" }, 400);

  const candidates = await db
    .select()
    .from(knowledgeItems)
    .where(sql`${knowledgeItems.status} NOT IN ('rejected', 'archived')`)
    .limit(300);
  if (candidates.length === 0) return c.json({ items: [] });

  const ranked = rankBySimilarityForKnowledge(parsed.data.text, candidates, { limit: 5, minScore: 0.08 });
  return c.json({ items: ranked });
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

/**
 * 知見の削除。承認済み(approved)・要再確認(revalidation_required)・廃止済み
 * (archived)は監査証跡・版管理を保全するため削除不可(archive/revalidateを使う)。
 * 自分が登録した知見は contributor 以上、他者の知見は approver 以上が削除できる。
 */
knowledgeRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") as string;

  const [existing] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  if (!existing) return c.json({ error: "見つかりません" }, 404);

  const isOwner = existing.createdBy === user.id;
  const allowedByApprover =
    permissions.deleteAnyKnowledge(user.role) &&
    (APPROVER_DELETABLE_STATUSES as readonly string[]).includes(existing.status);
  const allowedByOwner =
    isOwner &&
    permissions.deleteOwnKnowledge(user.role) &&
    (OWNER_DELETABLE_STATUSES as readonly string[]).includes(existing.status);

  if (!allowedByApprover && !allowedByOwner) {
    if (["approved", "revalidation_required", "archived"].includes(existing.status)) {
      return c.json(
        { error: "承認済み・要再確認・廃止済みの知見は削除できません。廃止(archive)を使用してください。" },
        409,
      );
    }
    return c.json({ error: "削除権限がありません" }, 403);
  }

  await db.delete(knowledgeItems).where(eq(knowledgeItems.id, id));

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "DELETE",
    objectType: "knowledge_item",
    objectId: id,
    beforeVersion: existing.version,
    reason: `status=${existing.status} owner=${isOwner}`,
  });

  return c.body(null, 204);
});

/**
 * §9 類似知見: 承認済み知見の中から、内容(課題・原因・対応・結果)ベースの
 * 意味的類似度(TF-IDFコサイン類似度、lib/text-similarity.ts参照)でランク付け
 * して返す。同一work_categoryを共有する場合はスコアを加点する。従来は
 * work_categoryの完全一致のみに依存しており、タグが無い/異なる知見は
 * 内容が近くても一切表示されなかった。
 */
knowledgeRoutes.get("/:id/similar", async (c) => {
  const id = c.req.param("id") as string;
  const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  if (!item) return c.json({ error: "見つかりません" }, 404);

  const candidates = await db
    .select()
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.status, "approved"), ne(knowledgeItems.id, id)))
    .limit(300);
  if (candidates.length === 0) return c.json({ items: [] });

  const targetText = knowledgeSearchableText(item);
  const ranked = rankSimilarDocs(
    { id: item.id, text: targetText },
    candidates.map((r) => ({ id: r.id, text: knowledgeSearchableText(r) })),
    { limit: 10 },
  );
  const byId = new Map(candidates.map((r) => [r.id, r]));
  const sameCategory = item.workCategory.length > 0 ? arrayOverlaps(knowledgeItems.workCategory, item.workCategory) : undefined;
  const categoryIds = sameCategory
    ? new Set((await db.select({ id: knowledgeItems.id }).from(knowledgeItems).where(and(sameCategory, ne(knowledgeItems.id, id)))).map((r) => r.id))
    : new Set<string>();

  const items = ranked
    .map((r) => ({ score: r.score + (categoryIds.has(r.id) ? 0.15 : 0), row: byId.get(r.id)! }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.row);

  return c.json({ items });
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
