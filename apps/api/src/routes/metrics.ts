import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { authGuard, requireRole } from "../middleware/auth-guard.js";
import { permissions } from "../lib/rbac.js";

export const metricsRoutes = new Hono();
metricsRoutes.use("*", authGuard, requireRole(permissions.viewMetrics));

/**
 * GET /api/v1/metrics — PoC評価指標 (企画書§11 / 要件定義書§16) を
 * 実データから集計する。数値目標(KPI合格基準)はPoC開始前TBDのため、
 * ここでは「計測が実際に機能すること」をMVPの受入対象とする。
 */
metricsRoutes.get("/", async (c) => {
  const registrationResult = await db.execute<{ source_count: number; contributor_count: number }>(sql`
    select count(*)::int as source_count,
           count(distinct owner_id)::int as contributor_count
    from sources
  `);
  const registration = registrationResult.rows[0];

  const statusBreakdownResult = await db.execute<{ status: string; count: number }>(sql`
    select status, count(*)::int as count from knowledge_items group by status
  `);

  const reviewStatsResult = await db.execute<{
    decided_count: number;
    returned_count: number;
    avg_review_seconds: number | null;
  }>(sql`
    select
      count(*) filter (where decision <> 'pending')::int as decided_count,
      count(*) filter (where decision = 'returned')::int as returned_count,
      avg(extract(epoch from (decided_at - created_at))) filter (where decided_at is not null) as avg_review_seconds
    from review_cases
  `);
  const reviewStats = reviewStatsResult.rows[0];

  const approvalStatsResult = await db.execute<{
    approved_count: number;
    rejected_count: number;
    avg_ai_confidence: number | null;
  }>(sql`
    select
      count(*) filter (where status = 'approved')::int as approved_count,
      count(*) filter (where status = 'rejected')::int as rejected_count,
      avg(ai_confidence) as avg_ai_confidence
    from knowledge_items
  `);
  const approvalStats = approvalStatsResult.rows[0];

  const usageBreakdownResult = await db.execute<{ event_type: string; count: number }>(sql`
    select event_type, count(*)::int as count from usage_events group by event_type
  `);

  const decidedCount = Number(reviewStats?.decided_count ?? 0);
  const returnedCount = Number(reviewStats?.returned_count ?? 0);
  const approvedCount = Number(approvalStats?.approved_count ?? 0);
  const rejectedCount = Number(approvalStats?.rejected_count ?? 0);

  return c.json({
    registration: {
      sourceCount: Number(registration?.source_count ?? 0),
      contributorCount: Number(registration?.contributor_count ?? 0),
    },
    statusBreakdown: statusBreakdownResult.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
    review: {
      decidedCount,
      returnedCount,
      returnRate: decidedCount > 0 ? returnedCount / decidedCount : null,
      avgReviewSeconds: reviewStats?.avg_review_seconds ? Number(reviewStats.avg_review_seconds) : null,
    },
    approval: {
      approvedCount,
      rejectedCount,
      approvalRate:
        approvedCount + rejectedCount > 0 ? approvedCount / (approvedCount + rejectedCount) : null,
      avgAiConfidence: approvalStats?.avg_ai_confidence ? Number(approvalStats.avg_ai_confidence) : null,
    },
    usage: usageBreakdownResult.rows.map((r) => ({ eventType: r.event_type, count: Number(r.count) })),
  });
});
