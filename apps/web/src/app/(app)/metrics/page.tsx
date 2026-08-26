"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Metrics } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeStatus } from "@/lib/types";

/** UI-09 KPI/分析: 企画書§11 / 要件定義書§16 の指標を実データから表示する */
export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    api.metrics().then(setMetrics);
  }, []);

  if (!metrics) return <div className="text-sm text-slate-500">読み込み中...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">KPI・分析</h1>
        <p className="mt-1 text-sm text-slate-500">
          実データから計測。数値の合格基準はPoC開始前に確定するため、ここでは計測自体が機能することを示す。
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="登録件数" value={metrics.registration.sourceCount} />
        <Card label="登録者数" value={metrics.registration.contributorCount} />
        <Card label="レビュー完了件数" value={metrics.review.decidedCount} />
        <Card
          label="差戻し率"
          value={metrics.review.returnRate !== null ? `${Math.round(metrics.review.returnRate * 100)}%` : "-"}
        />
        <Card label="承認件数" value={metrics.approval.approvedCount} />
        <Card label="却下件数" value={metrics.approval.rejectedCount} />
        <Card
          label="承認率"
          value={metrics.approval.approvalRate !== null ? `${Math.round(metrics.approval.approvalRate * 100)}%` : "-"}
        />
        <Card
          label="平均AI信頼度"
          value={metrics.approval.avgAiConfidence !== null ? `${Math.round(metrics.approval.avgAiConfidence * 100)}%` : "-"}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">ステータス別件数</h2>
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
          {metrics.statusBreakdown.map((s) => (
            <div key={s.status} className="flex items-center gap-2">
              <StatusBadge status={s.status as KnowledgeStatus} />
              <span className="text-sm font-semibold text-slate-700">{s.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">利用実績（再利用・参照）</h2>
        <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          {metrics.usage.length === 0 && <p className="text-slate-400">まだ利用実績がありません。</p>}
          {metrics.usage.map((u) => (
            <div key={u.eventType}>
              <span className="text-slate-500">{USAGE_LABEL[u.eventType] ?? u.eventType}: </span>
              <span className="font-semibold text-slate-800">{u.count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const USAGE_LABEL: Record<string, string> = {
  view: "閲覧",
  search_hit: "検索ヒット",
  reuse: "再利用",
  citation: "引用",
};

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
