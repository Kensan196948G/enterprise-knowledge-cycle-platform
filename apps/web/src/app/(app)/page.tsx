"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth, hasAtLeastRole } from "@/lib/auth-context";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeItem, Metrics } from "@/lib/types";

const STAGNATION_DAYS = 3;

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function pct(v: number | null): string {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
}

const SEGMENTS: Array<{ key: string; label: string; color: string; match: (s: string) => boolean }> = [
  { key: "approved", label: "承認済み（正式知見）", color: "#1F8255", match: (s) => s === "approved" },
  { key: "pending", label: "レビュー待ち・差戻し", color: "#B5701A", match: (s) => s === "review_pending" || s === "returned" },
  { key: "ai", label: "AI構造化済み（参考）", color: "#6B45B0", match: (s) => s === "ai_processed" },
  {
    key: "other",
    label: "下書き・その他",
    color: "#8A97A8",
    match: (s) => ["draft", "revalidation_required", "rejected", "archived"].includes(s),
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    api.listKnowledge({}).then((r) => setItems(r.items));
    if (user && hasAtLeastRole(user.role, "approver")) {
      api.metrics().then(setMetrics).catch(() => undefined);
    }
  }, [user]);

  if (!user) return null;

  const drafts = items.filter((i) => i.status === "draft");
  const aiProcessed = items.filter((i) => i.status === "ai_processed");
  const pending = items.filter((i) => i.status === "review_pending");
  const approved = items.filter((i) => i.status === "approved");
  const stagnant = pending.filter((i) => daysAgo(i.updatedAt) >= STAGNATION_DAYS);
  const recentApproved = [...approved]
    .sort((a, b) => (b.approvedAt ?? b.updatedAt).localeCompare(a.approvedAt ?? a.updatedAt))
    .slice(0, 5);
  const registeredThisWeek = items.filter((i) => daysAgo(i.createdAt) <= 7).length;
  const approvedThisMonth = approved.filter((i) => i.approvedAt && daysAgo(i.approvedAt) <= 30).length;

  const segCounts = SEGMENTS.map((s) => ({ ...s, count: items.filter((i) => s.match(i.status)).length }));
  const segTotal = segCounts.reduce((a, s) => a + s.count, 0) || 1;

  const kpis = [
    { lbl: "登録件数", val: items.length, dot: "#2E5AAC", sub: `今週 +${registeredThisWeek}`, warn: false },
    {
      lbl: "レビュー待ち",
      val: pending.length,
      dot: "#B5701A",
      sub: stagnant.length ? `最長 ${Math.max(...stagnant.map((i) => daysAgo(i.updatedAt)))}日経過` : "滞留なし",
      warn: stagnant.length > 0,
    },
    { lbl: "承認済み知見", val: approved.length, dot: "#1F8255", sub: `今月 +${approvedThisMonth}`, warn: false },
    metrics
      ? {
          lbl: "差戻し率",
          val: pct(metrics.review.returnRate),
          dot: "#C5392F",
          sub: metrics.review.avgReviewSeconds !== null ? `平均レビュー ${Math.round(metrics.review.avgReviewSeconds / 60)}分` : "-",
          warn: false,
        }
      : { lbl: "AI構造化済み", val: aiProcessed.length, dot: "#6B45B0", sub: "参考候補", warn: false },
  ];

  const kanbanCols: Array<{ name: string; dot: string; items: KnowledgeItem[]; total: number; arrow: boolean; meta: (i: KnowledgeItem) => [string, string, boolean] }> = [
    {
      name: "一次情報・下書き",
      dot: "#8A97A8",
      items: drafts,
      total: drafts.length,
      arrow: true,
      meta: (i) => [new Date(i.createdAt).toLocaleDateString("ja-JP"), i.workCategory[0] ?? "", false],
    },
    {
      name: "AI構造化済み（参考）",
      dot: "#6B45B0",
      items: aiProcessed,
      total: aiProcessed.length,
      arrow: true,
      meta: (i) => [i.workCategory[0] ?? "未分類", i.aiConfidence !== null ? `信頼度 ${pct(i.aiConfidence)}` : "-", false],
    },
    {
      name: "レビュー・承認待ち",
      dot: "#B5701A",
      items: pending,
      total: pending.length,
      arrow: true,
      meta: (i) => {
        const d = daysAgo(i.updatedAt);
        const conflicts = i.aiOutput?.conflicts.length ?? 0;
        return [d === 0 ? "今日" : `${d}日経過`, conflicts ? `矛盾 ${conflicts}件` : i.aiConfidence !== null ? `信頼度 ${pct(i.aiConfidence)}` : "-", d >= STAGNATION_DAYS];
      },
    },
    {
      name: "承認済み（正式知見）",
      dot: "#1F8255",
      items: approved,
      total: approved.length,
      arrow: false,
      meta: (i) => [i.workCategory[0] ?? "未分類", `v${i.version}`, false],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.lbl} className="flex flex-col gap-1.5 rounded-[10px] border border-borderc bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium text-muted">{k.lbl}</span>
              <span className="h-2 w-2 rounded-[3px]" style={{ background: k.dot }} />
            </div>
            <div className="text-[28px] font-semibold leading-none tracking-tight text-ink tabular-nums">{k.val}</div>
            <div className={`text-[11px] font-medium ${k.warn ? "text-warn" : "text-approved"}`}>{k.sub}</div>
          </div>
        ))}
      </section>

      {hasAtLeastRole(user.role, "reviewer") && stagnant.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-orange-200 bg-warnBg px-3.5 py-2.5 text-[13px] text-warn">
          ⚠ {stagnant.length}件のレビュー候補が{STAGNATION_DAYS}日以上滞留しています。優先して確認してください。
          <div className="flex-1" />
          <Link href="/review-queue" className="rounded-md border border-warn bg-white px-3 py-1 text-xs font-semibold text-warn">
            キューを開く
          </Link>
        </div>
      )}

      <div>
        <div className="mb-2.5 flex items-baseline gap-2.5">
          <span className="text-sm font-semibold text-ink">ナレッジサイクル</span>
          <span className="text-[11.5px] text-muted">登録 → AI整理 → レビュー・承認 → 活用</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kanbanCols.map((col) => (
            <div key={col.name} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: col.dot }} />
                <span className="flex-1 text-[12.5px] font-semibold text-subtle">{col.name}</span>
                <span className="font-mono text-[11.5px] text-muted">{col.total}</span>
                {col.arrow && <span className="text-[#A2AEBC]">→</span>}
              </div>
              {col.items.slice(0, 3).map((i) => {
                const [m1, m2, warnMeta] = col.meta(i);
                return (
                  <Link
                    key={i.id}
                    href={`/knowledge/${i.id}`}
                    className="rounded-[10px] border border-borderc bg-white p-3.5 shadow-sm hover:bg-[#FAFBFC]"
                    style={{ borderLeft: col.dot !== "#8A97A8" ? `3px solid ${col.dot}` : undefined }}
                  >
                    <div className="text-[12.5px] font-medium leading-snug text-ink">{i.title}</div>
                    <div className="mt-1.5 flex justify-between gap-2">
                      <span className={`text-[11px] ${warnMeta ? "font-semibold text-reject" : "text-muted"}`}>{m1}</span>
                      <span className="text-[11px] font-semibold text-aiRef">{m2}</span>
                    </div>
                  </Link>
                );
              })}
              {col.items.length === 0 && <p className="px-1 text-[11.5px] text-muted">なし</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
        <div className="rounded-[10px] border border-borderc bg-white shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-panel px-[18px] py-[15px]">
            <span className="text-sm font-semibold text-ink">最近の承認済み知見</span>
            <div className="flex-1" />
            <Link href="/knowledge" className="text-xs text-subtle hover:underline">
              知見一覧へ
            </Link>
          </div>
          {recentApproved.length === 0 && <p className="px-[18px] py-6 text-sm text-muted">まだ承認済み知見がありません。</p>}
          {recentApproved.map((k) => (
            <Link
              key={k.id}
              href={`/knowledge/${k.id}`}
              className="flex items-center gap-3.5 border-b border-panel px-[18px] py-3 last:border-b-0 hover:bg-[#FAFBFC]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{k.title}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">{k.workCategory.join(" · ") || "未分類"} · v{k.version}</div>
              </div>
              <StatusBadge status={k.status} />
            </Link>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-[10px] border border-borderc bg-white p-[17px] shadow-sm">
            <div className="mb-3 text-sm font-semibold text-ink">ステータス内訳</div>
            <div className="mb-3.5 flex h-2.5 overflow-hidden rounded-[5px]">
              {segCounts.map((s) => (
                <span key={s.key} style={{ width: `${(s.count / segTotal) * 100}%`, background: s.color }} />
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              {segCounts.map((s) => (
                <div key={s.key} className="flex items-center gap-2.5">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: s.color }} />
                  <span className="flex-1 text-[12.5px] text-subtle">{s.label}</span>
                  <span className="font-mono text-[12.5px] font-semibold text-ink">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5 rounded-[10px] border border-borderc bg-white p-[17px] shadow-sm">
            <div className="text-sm font-semibold text-ink">クイックアクション</div>
            <button
              onClick={() => router.push("/register")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2.5 text-[12.5px] font-semibold text-white hover:bg-accentHover"
            >
              ✏️ 気づき・トラブルを登録する
            </button>
            <button
              onClick={() => router.push("/search")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-borderc bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-subtle hover:bg-panel"
            >
              🔍 過去の知見を検索する
            </button>
            <div className="border-t border-panel pt-2.5 text-[11.5px] leading-relaxed text-muted">
              AIが作るのは<span className="font-semibold text-aiRef">参考案</span>です。正式な知見は人の承認後に
              <span className="font-semibold text-approved">緑色</span>で表示されます。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
