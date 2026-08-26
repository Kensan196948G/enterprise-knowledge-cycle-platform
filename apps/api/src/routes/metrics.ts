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

  /**
   * 傾向分析(1): 分野(work_category)別のレビュー品質。差戻し・却下が集中している
   * 分野を可視化し、どこにナレッジの質の課題があるかを把握できるようにする。
   */
  const categoryQualityResult = await db.execute<{
    category: string;
    decided_count: number;
    issue_count: number;
  }>(sql`
    select cat as category,
      count(*) filter (where rc.decision <> 'pending')::int as decided_count,
      count(*) filter (where rc.decision in ('returned','rejected'))::int as issue_count
    from knowledge_items ki
    cross join lateral unnest(ki.work_category) as cat
    join review_cases rc on rc.knowledge_id = ki.id
    group by cat
    having count(*) filter (where rc.decision <> 'pending') > 0
    order by (count(*) filter (where rc.decision in ('returned','rejected')))::float
      / nullif(count(*) filter (where rc.decision <> 'pending'), 0) desc
  `);

  /**
   * 傾向分析(2): レビュー待ちの滞留要因。件数だけでなく、平均滞留日数・矛盾を
   * 抱えている件数・最長滞留日数を示し、どこに手当てが必要かを判断しやすくする。
   */
  const stagnationResult = await db.execute<{
    pending_count: number;
    avg_pending_days: number | null;
    max_pending_days: number | null;
    with_conflicts: number;
  }>(sql`
    select
      count(*)::int as pending_count,
      avg(extract(epoch from (now() - updated_at)) / 86400) as avg_pending_days,
      max(extract(epoch from (now() - updated_at)) / 86400) as max_pending_days,
      count(*) filter (where jsonb_array_length(coalesce(ai_output->'conflicts', '[]'::jsonb)) > 0)::int as with_conflicts
    from knowledge_items
    where status = 'review_pending'
  `);
  const stagnation = stagnationResult.rows[0];

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
    trends: {
      categoryQuality: categoryQualityResult.rows.map((r) => ({
        category: r.category,
        decidedCount: Number(r.decided_count),
        issueCount: Number(r.issue_count),
        issueRate: Number(r.decided_count) > 0 ? Number(r.issue_count) / Number(r.decided_count) : null,
      })),
      stagnation: {
        pendingCount: Number(stagnation?.pending_count ?? 0),
        avgPendingDays: stagnation?.avg_pending_days !== null && stagnation?.avg_pending_days !== undefined ? Number(stagnation.avg_pending_days) : null,
        maxPendingDays: stagnation?.max_pending_days !== null && stagnation?.max_pending_days !== undefined ? Number(stagnation.max_pending_days) : null,
        withConflicts: Number(stagnation?.with_conflicts ?? 0),
      },
    },
  });
});
