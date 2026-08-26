import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { knowledgeItems, reviewCases } from "../db/schema.js";
import { authGuard, requireRole } from "../middleware/auth-guard.js";
import { permissions } from "../lib/rbac.js";
import { recordAudit, newCorrelationId } from "../lib/audit.js";
import type { StructuredOutput } from "../lib/ai-structuring.js";

export const reviewRoutes = new Hono();

reviewRoutes.use("*", authGuard);

const requestReviewSchema = z.object({
  knowledgeId: z.string().uuid(),
  assignedTo: z.string().uuid().optional(),
  comment: z.string().optional(),
});

/** §9 レビュー依頼: Draft/AI-Processed -> Review-Pending (詳細仕様設計書 §12: Contributor+) */
reviewRoutes.post("/", requireRole(permissions.editKnowledgeCandidate), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = requestReviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }

  const [item] = await db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.id, parsed.data.knowledgeId))
    .limit(1);
  if (!item) return c.json({ error: "対象の知見が見つかりません" }, 404);
  if (item.status !== "draft" && item.status !== "ai_processed" && item.status !== "returned") {
    return c.json({ error: `status=${item.status} からはレビュー依頼できません` }, 409);
  }

  const [reviewCase] = await db
    .insert(reviewCases)
    .values({
      knowledgeId: item.id,
      requestedBy: user.id,
      assignedTo: parsed.data.assignedTo,
      comment: parsed.data.comment,
    })
    .returning();

  await db
    .update(knowledgeItems)
    .set({ status: "review_pending", updatedAt: new Date() })
    .where(eq(knowledgeItems.id, item.id));

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "REVIEW",
    objectType: "review_case",
    objectId: reviewCase.id,
    correlationId: newCorrelationId(),
  });

  return c.json(reviewCase, 201);
});

async function loadReviewWithKnowledge(reviewId: string) {
  const [reviewCase] = await db.select().from(reviewCases).where(eq(reviewCases.id, reviewId)).limit(1);
  if (!reviewCase) return null;
  const [item] = await db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.id, reviewCase.knowledgeId))
    .limit(1);
  return { reviewCase, item };
}

const decisionSchema = z.object({
  reason: z.string().optional(),
  acknowledgeConflicts: z.boolean().optional().default(false),
});

/** §9 承認時バリデーション: 根拠1件以上・必須項目充足・未解決の重大矛盾の確認 */
reviewRoutes.post("/:id/approve", requireRole(permissions.approve), async (c) => {
  const user = c.get("user");
  const reviewId = c.req.param("id") as string;
  const body = await c.req.json().catch(() => ({}));
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "入力値が不正です" }, 400);

  const loaded = await loadReviewWithKnowledge(reviewId);
  if (!loaded) return c.json({ error: "レビューが見つかりません" }, 404);
  const { reviewCase, item } = loaded;
  if (!item || item.status !== "review_pending") {
    return c.json({ error: "承認可能な状態ではありません" }, 409);
  }
  if (!item.issue || !item.applicableConditions) {
    return c.json({ error: "必須項目(課題・事象/適用条件)が未入力のため承認できません" }, 422);
  }
  const aiOutput = item.aiOutput as StructuredOutput | null;
  if (aiOutput && aiOutput.conflicts.length > 0 && !parsed.data.acknowledgeConflicts) {
    return c.json(
      {
        error: "未解決の矛盾があります。確認のうえ acknowledgeConflicts=true で再送してください。",
        conflicts: aiOutput.conflicts,
      },
      409,
    );
  }

  const [updatedItem] = await db
    .update(knowledgeItems)
    .set({
      status: "approved",
      approverId: user.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeItems.id, item.id))
    .returning();

  await db
    .update(reviewCases)
    .set({ decision: "approved", decidedAt: new Date(), decidedBy: user.id, reason: parsed.data.reason })
    .where(eq(reviewCases.id, reviewCase.id));

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "APPROVE",
    objectType: "knowledge_item",
    objectId: item.id,
    beforeVersion: item.version,
    afterVersion: updatedItem.version,
    reason: parsed.data.reason,
  });

  return c.json(updatedItem);
});

const returnSchema = z.object({ reason: z.string().min(1, "差戻し理由は必須です") });

/** §5 状態遷移: Review-Pending -> Returned (理由必須) */
reviewRoutes.post("/:id/return", requireRole(permissions.review), async (c) => {
  const user = c.get("user");
  const reviewId = c.req.param("id") as string;
  const body = await c.req.json().catch(() => null);
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "差戻し理由は必須です" }, 400);

  const loaded = await loadReviewWithKnowledge(reviewId);
  if (!loaded?.item) return c.json({ error: "レビューが見つかりません" }, 404);
  const { reviewCase, item } = loaded;
  if (item.status !== "review_pending") return c.json({ error: "差戻し可能な状態ではありません" }, 409);

  const [updatedItem] = await db
    .update(knowledgeItems)
    .set({ status: "returned", updatedAt: new Date() })
    .where(eq(knowledgeItems.id, item.id))
    .returning();

  await db
    .update(reviewCases)
    .set({ decision: "returned", decidedAt: new Date(), decidedBy: user.id, reason: parsed.data.reason })
    .where(eq(reviewCases.id, reviewCase.id));

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "RETURN",
    objectType: "knowledge_item",
    objectId: item.id,
    reason: parsed.data.reason,
  });

  return c.json(updatedItem);
});

/** §5 状態遷移: Review-Pending -> Rejected (理由必須、承認権限者のみ) */
reviewRoutes.post("/:id/reject", requireRole(permissions.approve), async (c) => {
  const user = c.get("user");
  const reviewId = c.req.param("id") as string;
  const body = await c.req.json().catch(() => null);
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "却下理由は必須です" }, 400);

  const loaded = await loadReviewWithKnowledge(reviewId);
  if (!loaded?.item) return c.json({ error: "レビューが見つかりません" }, 404);
  const { reviewCase, item } = loaded;
  if (item.status !== "review_pending") return c.json({ error: "却下可能な状態ではありません" }, 409);

  const [updatedItem] = await db
    .update(knowledgeItems)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(knowledgeItems.id, item.id))
    .returning();

  await db
    .update(reviewCases)
    .set({ decision: "rejected", decidedAt: new Date(), decidedBy: user.id, reason: parsed.data.reason })
    .where(eq(reviewCases.id, reviewCase.id));

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "REJECT",
    objectType: "knowledge_item",
    objectId: item.id,
    reason: parsed.data.reason,
  });

  return c.json(updatedItem);
});

/** 専門分野責任者へのエスカレーション */
reviewRoutes.post("/:id/escalate", requireRole(permissions.review), async (c) => {
  const reviewId = c.req.param("id") as string;
  const loaded = await loadReviewWithKnowledge(reviewId);
  if (!loaded) return c.json({ error: "レビューが見つかりません" }, 404);

  const [updated] = await db
    .update(reviewCases)
    .set({ escalated: true })
    .where(eq(reviewCases.id, reviewId))
    .returning();
  return c.json(updated);
});
