"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import { priorityScore, priorityReasons } from "@/lib/priority";
import type { KnowledgeItem } from "@/lib/types";

const DEFAULT_STAGNATION_DAYS = 3;

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

type SortMode = "priority" | "days";

/**
 * UI-07 承認キュー: レビュー待ちの知見を一覧化する。既定は優先度スコア順
 * (滞留日数・矛盾件数・AI信頼度を加味)で並べ、単純な滞留日数順にも切替できる。
 */
export default function ReviewQueuePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [stagnationDays, setStagnationDays] = useState(DEFAULT_STAGNATION_DAYS);
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  useEffect(() => {
    api.listKnowledge({ status: "review_pending" }).then((r) => setItems(r.items));
    api.getSettings().then((s) => setStagnationDays(s.stagnationAlertDays)).catch(() => undefined);
  }, []);

  const sorted = useMemo(() => {
    const withMeta = items.map((k) => {
      const d = daysAgo(k.updatedAt);
      return { item: k, days: d, score: priorityScore(k, d) };
    });
    withMeta.sort((a, b) => (sortMode === "priority" ? b.score - a.score : b.days - a.days));
    return withMeta;
  }, [items, sortMode]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <p className="text-[12.5px] text-subtle">レビュー待ちの知見候補 {items.length}件</p>
        <div className="flex-1" />
        <span className="text-[11.5px] text-muted">並び順:</span>
        <div className="flex overflow-hidden rounded-md border border-borderc">
          {(
            [
              ["priority", "優先度"],
              ["days", "滞留日数"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3 py-1 text-[11.5px] font-medium ${sortMode === mode ? "bg-accent text-white" : "bg-white text-subtle hover:bg-panel"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-borderc bg-white shadow-sm">
        {items.length === 0 && <p className="px-[18px] py-[26px] text-center text-[13px] text-muted">レビュー待ちの知見はありません。</p>}
        {sorted.map(({ item: k, days: d, score }) => {
          const late = d >= stagnationDays;
          const conflicts = k.aiOutput?.conflicts.length ?? 0;
          const reasons = priorityReasons(k, d);
          return (
            <Link
              key={k.id}
              href={`/knowledge/${k.id}`}
              className="flex items-center gap-3.5 border-b border-panel px-[18px] py-3.5 last:border-b-0 hover:bg-[#FAFBFC]"
            >
              {sortMode === "priority" ? (
                <span
                  className={`w-[52px] shrink-0 rounded-md py-1 text-center font-mono text-[11.5px] font-semibold ${
                    score >= 0.5 ? "bg-rejectBg text-reject" : score >= 0.25 ? "bg-warnBg text-warn" : "bg-panel text-subtle"
                  }`}
                >
                  {Math.round(score * 100)}
                </span>
              ) : (
                <span
                  className={`w-[52px] shrink-0 rounded-md py-1 text-center font-mono text-[11.5px] font-semibold ${
                    late ? "bg-rejectBg text-reject" : "bg-panel text-subtle"
                  }`}
                >
                  {d === 0 ? "今日" : `${d}日`}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{k.title}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  {k.projectSite ?? "—"} · AI信頼度 {k.aiConfidence !== null ? `${Math.round(k.aiConfidence * 100)}%` : "-"}
                  {reasons.length > 0 ? ` · ${reasons.join(" / ")}` : ""}
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
