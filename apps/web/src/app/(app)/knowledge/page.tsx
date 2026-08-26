"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import { useAuth, canDeleteKnowledge } from "@/lib/auth-context";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeItem, KnowledgeStatus } from "@/lib/types";

const STATUS_TABS: Array<{ value: KnowledgeStatus | "all"; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "approved", label: "承認済み" },
  { value: "review_pending", label: "レビュー待ち" },
  { value: "ai_processed", label: "AI構造化済み" },
  { value: "draft", label: "下書き" },
  { value: "returned", label: "差戻し" },
  { value: "rejected", label: "却下" },
  { value: "revalidation_required", label: "要再確認" },
  { value: "archived", label: "廃止" },
];

export default function KnowledgeListPage() {
  const { user } = useAuth();
  const [allItems, setAllItems] = useState<KnowledgeItem[]>([]);
  const [status, setStatus] = useState<KnowledgeStatus | "all">("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listKnowledge({ q: q || undefined }).then((r) => setAllItems(r.items));
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("この知見を削除します。この操作は取り消せません。よろしいですか？")) return;
    setError(null);
    try {
      await api.deleteKnowledge(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "削除に失敗しました");
    }
  }

  const items = status === "all" ? allItems : allItems.filter((i) => i.status === status);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => {
          const n = t.value === "all" ? allItems.length : allItems.filter((i) => i.status === t.value).length;
          const active = status === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                active ? "border-accent bg-warnBg text-warn" : "border-borderc bg-white text-subtle hover:bg-panel"
              }`}
            >
              {t.label} <span className="font-mono opacity-70">{n}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="タイトル・課題で絞り込み"
          className="w-[230px] rounded-lg border border-borderc px-2.5 py-2 text-[12.5px] outline-none focus:border-accent"
        />
      </div>
      {error && <p className="text-sm text-reject">{error}</p>}
      <div className="overflow-hidden rounded-[10px] border border-borderc bg-white shadow-sm">
        {items.length === 0 && <p className="px-[18px] py-[26px] text-center text-[13px] text-muted">該当する知見がありません。</p>}
        {items.map((k) => {
          const deletable = user ? canDeleteKnowledge(user.role, k.status, k.createdBy === user.id) : false;
          return (
            <Link
              key={k.id}
              href={`/knowledge/${k.id}`}
              className="flex items-center gap-3.5 border-b border-panel px-[18px] py-3 last:border-b-0 hover:bg-[#FAFBFC]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{k.title}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-muted">{k.issue}</p>
              </div>
              {k.workCategory.length > 0 && (
                <span className="shrink-0 rounded-[5px] bg-panel px-1.5 py-0.5 font-mono text-[11px] text-subtle">
                  {k.workCategory.join(" · ")}
                </span>
              )}
              <StatusBadge status={k.status} />
              {deletable && (
                <button
                  onClick={(e) => onDelete(e, k.id)}
                  className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-reject hover:bg-rejectBg"
                >
                  削除
                </button>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
