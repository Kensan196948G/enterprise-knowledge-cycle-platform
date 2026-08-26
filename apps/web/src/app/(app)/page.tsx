"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth, hasAtLeastRole } from "@/lib/auth-context";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeItem, Metrics } from "@/lib/types";

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [approved, setApproved] = useState<KnowledgeItem[]>([]);
  const [pending, setPending] = useState<KnowledgeItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    api.listKnowledge({ status: "approved" }).then((r) => setApproved(r.items.slice(0, 5)));
    if (user && hasAtLeastRole(user.role, "reviewer")) {
      api.listKnowledge({ status: "review_pending" }).then((r) => setPending(r.items));
    }
    if (user && hasAtLeastRole(user.role, "approver")) {
      api.metrics().then(setMetrics).catch(() => undefined);
    }
  }, [user]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-bold text-slate-900">ホーム</h1>
        <p className="mt-1 text-sm text-slate-500">
          過去の知見を検索し、根拠付きで再利用できます。AI生成の候補と承認済みの正式知見は明確に区別して表示します。
        </p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) router.push(`/search?q=${encodeURIComponent(query)}`);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 港湾工事でコンクリート打設時に発生した不具合と対策を教えて"
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
          />
          <button className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            検索
          </button>
        </form>
      </section>

      {metrics && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="登録件数" value={metrics.registration.sourceCount} />
          <KpiCard label="承認件数" value={metrics.approval.approvedCount} />
          <KpiCard
            label="差戻し率"
            value={metrics.review.returnRate !== null ? `${Math.round(metrics.review.returnRate * 100)}%` : "-"}
          />
          <KpiCard
            label="平均レビュー時間"
            value={
              metrics.review.avgReviewSeconds !== null
                ? `${Math.round(metrics.review.avgReviewSeconds / 60)}分`
                : "-"
            }
          />
        </section>
      )}

      {user && hasAtLeastRole(user.role, "reviewer") && pending.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">レビュー待ち ({pending.length}件)</h2>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {pending.map((k) => (
              <Link key={k.id} href={`/knowledge/${k.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <span className="text-sm text-slate-800">{k.title}</span>
                <StatusBadge status={k.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">最近の承認済み知見</h2>
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {approved.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">まだ承認済み知見がありません。</p>}
          {approved.map((k) => (
            <Link key={k.id} href={`/knowledge/${k.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span className="text-sm text-slate-800">{k.title}</span>
              <StatusBadge status={k.status} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
