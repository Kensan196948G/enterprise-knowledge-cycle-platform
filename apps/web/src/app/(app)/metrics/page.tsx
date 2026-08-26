"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Metrics } from "@/lib/types";

const STATUS_META: Record<string, { label: string; color: string }> = {
  approved: { label: "承認済み", color: "#1F8255" },
  review_pending: { label: "レビュー待ち", color: "#B5701A" },
  returned: { label: "差戻し", color: "#B5701A" },
  ai_processed: { label: "AI構造化済み", color: "#6B45B0" },
  draft: { label: "下書き", color: "#8A97A8" },
  rejected: { label: "却下", color: "#C5392F" },
  revalidation_required: { label: "要再確認", color: "#B5701A" },
  archived: { label: "廃止", color: "#8A97A8" },
};

const USAGE_LABEL: Record<string, string> = {
  view: "閲覧",
  search_hit: "検索ヒット",
  reuse: "再利用",
  citation: "引用",
};

/** UI-09 KPI/分析: 企画書§11 / 要件定義書§16 の指標を実データから表示する */
export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    api.metrics().then(setMetrics);
  }, []);

  if (!metrics) return <div className="text-sm text-muted">読み込み中...</div>;

  const pct = (v: number | null) => (v !== null ? `${Math.round(v * 100)}%` : "-");
  const cards = [
    { label: "登録件数", value: metrics.registration.sourceCount },
    { label: "登録者数", value: metrics.registration.contributorCount },
    { label: "レビュー完了件数", value: metrics.review.decidedCount },
    { label: "差戻し率", value: pct(metrics.review.returnRate) },
    { label: "承認件数", value: metrics.approval.approvedCount },
    { label: "却下件数", value: metrics.approval.rejectedCount },
    { label: "承認率", value: pct(metrics.approval.approvalRate) },
    { label: "平均AI信頼度", value: pct(metrics.approval.avgAiConfidence) },
  ];

  const segTotal = metrics.statusBreakdown.reduce((a, s) => a + s.count, 0) || 1;
  const usageMax = Math.max(1, ...metrics.usage.map((u) => u.count));

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-4">
      <section className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[10px] border border-borderc bg-white p-4 shadow-sm">
            <div className="text-[11.5px] font-medium text-muted">{c.label}</div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{c.value}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <div className="rounded-[10px] border border-borderc bg-white p-[17px] shadow-sm">
          <div className="mb-3 text-sm font-semibold text-ink">ステータス別件数</div>
          <div className="mb-3.5 flex h-2.5 overflow-hidden rounded-[5px]">
            {metrics.statusBreakdown.map((s) => (
              <span
                key={s.status}
                style={{ width: `${(s.count / segTotal) * 100}%`, background: STATUS_META[s.status]?.color ?? "#8A97A8" }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            {metrics.statusBreakdown.map((s) => (
              <div key={s.status} className="flex items-center gap-2.5">
                <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: STATUS_META[s.status]?.color ?? "#8A97A8" }} />
                <span className="flex-1 text-[12.5px] text-subtle">{STATUS_META[s.status]?.label ?? s.status}</span>
                <span className="font-mono text-[12.5px] font-semibold text-ink">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[10px] border border-borderc bg-white p-[17px] shadow-sm">
          <div className="mb-1 text-sm font-semibold text-ink">利用実績（再利用・参照）</div>
          <div className="mb-3.5 text-[11.5px] text-muted">数値の合格基準はPoC開始前に確定。ここでは計測が機能することを示します。</div>
          <div className="flex flex-col gap-2.5">
            {metrics.usage.length === 0 && <p className="text-[12.5px] text-muted">まだ利用実績がありません。</p>}
            {metrics.usage.map((u) => (
              <div key={u.eventType} className="flex items-center gap-2.5">
                <span className="flex-1 text-[12.5px] text-subtle">{USAGE_LABEL[u.eventType] ?? u.eventType}</span>
                <div className="h-1.5 flex-[2] overflow-hidden rounded-[3px] bg-panel">
                  <span className="block h-full rounded-[3px] bg-[#2E5AAC]" style={{ width: `${(u.count / usageMax) * 100}%` }} />
                </div>
                <span className="w-[34px] text-right font-mono text-[12.5px] font-semibold text-ink">{u.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <div className="rounded-[10px] border border-borderc bg-white p-[17px] shadow-sm">
          <div className="mb-1 text-sm font-semibold text-ink">分野別レビュー品質（傾向分析）</div>
          <div className="mb-3.5 text-[11.5px] text-muted">差戻し・却下の割合が高い分野ほど、ナレッジの質に課題がある可能性を示します。</div>
          <div className="flex flex-col gap-2.5">
            {metrics.trends.categoryQuality.length === 0 && (
              <p className="text-[12.5px] text-muted">レビュー確定件数がまだ十分にありません。</p>
            )}
            {metrics.trends.categoryQuality.map((c) => (
              <div key={c.category} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 truncate text-[12.5px] text-subtle">{c.category}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-panel">
                  <span
                    className="block h-full rounded-[3px]"
                    style={{ width: `${(c.issueRate ?? 0) * 100}%`, background: (c.issueRate ?? 0) >= 0.3 ? "#C5392F" : "#B5701A" }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-[12px] text-ink">
                  {c.issueRate !== null ? `${Math.round(c.issueRate * 100)}%` : "-"}
                </span>
                <span className="w-16 shrink-0 text-right text-[11px] text-muted">{c.issueCount}/{c.decidedCount}件</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[10px] border border-borderc bg-white p-[17px] shadow-sm">
          <div className="mb-1 text-sm font-semibold text-ink">レビュー滞留状況（傾向分析）</div>
          <div className="mb-3.5 text-[11.5px] text-muted">レビュー待ちの知見が、どの程度・どのような要因で滞留しているかを示します。</div>
          <div className="grid grid-cols-2 gap-3">
            <TrendStat label="レビュー待ち件数" value={String(metrics.trends.stagnation.pendingCount)} />
            <TrendStat
              label="平均滞留日数"
              value={metrics.trends.stagnation.avgPendingDays !== null ? `${metrics.trends.stagnation.avgPendingDays.toFixed(1)}日` : "-"}
            />
            <TrendStat
              label="最長滞留日数"
              value={metrics.trends.stagnation.maxPendingDays !== null ? `${metrics.trends.stagnation.maxPendingDays.toFixed(1)}日` : "-"}
            />
            <TrendStat label="矛盾を含む件数" value={String(metrics.trends.stagnation.withConflicts)} warn={metrics.trends.stagnation.withConflicts > 0} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-panel p-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${warn ? "text-reject" : "text-ink"}`}>{value}</div>
    </div>
  );
}
