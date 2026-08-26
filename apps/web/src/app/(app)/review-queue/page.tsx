"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeItem } from "@/lib/types";

const DEFAULT_STAGNATION_DAYS = 3;

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/** UI-07 承認キュー: レビュー待ちの知見を滞留日数が長い順に一覧化する */
export default function ReviewQueuePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [stagnationDays, setStagnationDays] = useState(DEFAULT_STAGNATION_DAYS);

  useEffect(() => {
    api.listKnowledge({ status: "review_pending" }).then((r) => {
      setItems([...r.items].sort((a, b) => daysAgo(b.updatedAt) - daysAgo(a.updatedAt)));
    });
    api.getSettings().then((s) => setStagnationDays(s.stagnationAlertDays)).catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-3">
      <p className="text-[12.5px] text-subtle">レビュー待ちの知見候補 {items.length}件（滞留の長い順）</p>
      <div className="overflow-hidden rounded-[10px] border border-borderc bg-white shadow-sm">
        {items.length === 0 && <p className="px-[18px] py-[26px] text-center text-[13px] text-muted">レビュー待ちの知見はありません。</p>}
        {items.map((k) => {
          const d = daysAgo(k.updatedAt);
          const late = d >= stagnationDays;
          const conflicts = k.aiOutput?.conflicts.length ?? 0;
          return (
            <Link
              key={k.id}
              href={`/knowledge/${k.id}`}
              className="flex items-center gap-3.5 border-b border-panel px-[18px] py-3.5 last:border-b-0 hover:bg-[#FAFBFC]"
            >
              <span
                className={`w-[52px] shrink-0 rounded-md py-1 text-center font-mono text-[11.5px] font-semibold ${
                  late ? "bg-rejectBg text-reject" : "bg-panel text-subtle"
                }`}
              >
                {d === 0 ? "今日" : `${d}日`}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{k.title}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  {k.projectSite ?? "—"} · AI信頼度 {k.aiConfidence !== null ? `${Math.round(k.aiConfidence * 100)}%` : "-"}
                </div>
              </div>
              {conflicts > 0 && <span className="shrink-0 text-[11px] font-semibold text-reject">⚠ 矛盾 {conflicts}件</span>}
              <StatusBadge status={k.status} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
