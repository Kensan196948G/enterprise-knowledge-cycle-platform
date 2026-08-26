import { Hono } from "hono";
import { z } from "zod";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { knowledgeItems, evidenceLinks, sources, usageEvents } from "../db/schema.js";
import { authGuard } from "../middleware/auth-guard.js";
import { newCorrelationId } from "../lib/audit.js";

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
 */
searchRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "query は必須です" }, 400);

  const like = `%${parsed.data.query}%`;
  const textMatch = sql`(${knowledgeItems.title} ILIKE ${like} OR ${knowledgeItems.issue} ILIKE ${like} OR ${knowledgeItems.cause} ILIKE ${like} OR ${knowledgeItems.action} ILIKE ${like} OR ${knowledgeItems.result} ILIKE ${like})`;
  const categoryMatch = parsed.data.workCategory
    ? sql` AND ${parsed.data.workCategory} = ANY(${knowledgeItems.workCategory})`
    : sql``;

  const approvedRows = await db
    .select()
    .from(knowledgeItems)
    .where(sql`${knowledgeItems.status} = 'approved' AND ${textMatch}${categoryMatch}`)
    .orderBy(desc(knowledgeItems.approvedAt))
    .limit(20);

  let referenceRows: typeof approvedRows = [];
  if (parsed.data.includeReference) {
    referenceRows = await db
      .select()
      .from(knowledgeItems)
      .where(
        sql`${knowledgeItems.status} IN ('ai_processed','review_pending') AND ${textMatch}${categoryMatch}`,
      )
      .orderBy(desc(knowledgeItems.updatedAt))
      .limit(10);
  }

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
