import { Hono } from "hono";
import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { knowledgeItems, evidenceLinks, sources, usageEvents } from "../db/schema.js";
import { authGuard } from "../middleware/auth-guard.js";
import { newCorrelationId } from "../lib/audit.js";
import { rankBySimilarity, knowledgeSearchableText } from "../lib/text-similarity.js";

export const searchRoutes = new Hono();
searchRoutes.use("*", authGuard);

const searchSchema = z.object({
  query: z.string().min(1),
  workCategory: z.string().optional(),
  includeReference: z.boolean().default(true),
});

/**
 * FR-08 自然言語検索 / §8 検索・RAG設計。
 * 承認済み知見を優先し、includeReference=true の場合のみ未承認候補を
 * 「参考情報(reference)」として明示付きで併記する。
 *
 * 検索は文字bigramベースのTF-IDF類似度ランキング(意味的検索・簡易版)で行う。
 * キーワードの完全一致だけでなく、語順の違いや部分的な表現の一致でも
 * 関連度の高い知見を検出できる(詳細は lib/text-similarity.ts を参照)。
 */
searchRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "query は必須です" }, 400);

  const categoryMatch = parsed.data.workCategory
    ? sql`${parsed.data.workCategory} = ANY(${knowledgeItems.workCategory})`
    : sql`true`;

  const approvedCandidates = await db
    .select()
    .from(knowledgeItems)
    .where(sql`${knowledgeItems.status} = 'approved' AND ${categoryMatch}`)
    .limit(300);

  let referenceCandidates: typeof approvedCandidates = [];
  if (parsed.data.includeReference) {
    referenceCandidates = await db
      .select()
      .from(knowledgeItems)
      .where(sql`${knowledgeItems.status} IN ('ai_processed','review_pending') AND ${categoryMatch}`)
      .limit(300);
  }

  const rankedApproved = rankBySimilarity(
    parsed.data.query,
    approvedCandidates.map((r) => ({ id: r.id, text: knowledgeSearchableText(r) })),
    { limit: 20 },
  );
  const rankedReference = rankBySimilarity(
    parsed.data.query,
    referenceCandidates.map((r) => ({ id: r.id, text: knowledgeSearchableText(r) })),
    { limit: 10 },
  );
  const approvedById = new Map(approvedCandidates.map((r) => [r.id, r]));
  const referenceById = new Map(referenceCandidates.map((r) => [r.id, r]));
  const approvedRows = rankedApproved.map((r) => approvedById.get(r.id)!);
  const referenceRows = rankedReference.map((r) => referenceById.get(r.id)!);

  const allIds = [...approvedRows, ...referenceRows].map((r) => r.id);
  const evidenceByKnowledge: Record<string, unknown[]> = {};
  if (allIds.length > 0) {
    const evidenceRows = await db
      .select({
        knowledgeId: evidenceLinks.knowledgeId,
        sourceTitle: sources.title,
        sourceUri: sources.originalUri,
        sourceVersion: evidenceLinks.sourceVersion,
      })
      .from(evidenceLinks)
      .innerJoin(sources, eq(evidenceLinks.sourceId, sources.id))
      .where(inArray(evidenceLinks.knowledgeId, allIds));
    for (const row of evidenceRows) {
      (evidenceByKnowledge[row.knowledgeId] ??= []).push(row);
    }
  }

  const correlationId = newCorrelationId();
  if (allIds.length > 0) {
    await db.insert(usageEvents).values(
      allIds.map((id) => ({
        knowledgeId: id,
        userId: user.id,
        eventType: "search_hit" as const,
        correlationId,
      })),
    );
  }

  const toResult = (row: (typeof approvedRows)[number], kind: "approved" | "reference") => ({
    id: row.id,
    title: row.title,
    status: row.status,
    kind,
    issue: row.issue,
    cause: row.cause,
    action: row.action,
    result: row.result,
    outcomeType: row.outcomeType,
    applicableConditions: row.applicableConditions,
    exclusionConditions: row.exclusionConditions,
    standardsRefs: row.standardsRefs,
    version: row.version,
    approvedAt: row.approvedAt,
    evidence: evidenceByKnowledge[row.id] ?? [],
  });

  return c.json({
    correlationId,
    approved: approvedRows.map((r) => toResult(r, "approved")),
    reference: referenceRows.map((r) => toResult(r, "reference")),
  });
});
