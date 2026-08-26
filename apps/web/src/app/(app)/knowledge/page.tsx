"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
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
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [status, setStatus] = useState<KnowledgeStatus | "all">("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    api.listKnowledge({ status: status === "all" ? undefined : status, q: q || undefined }).then((r) => setItems(r.items));
  }, [status, q]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">知見一覧</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="タイトル・課題で絞り込み"
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              status === t.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">該当する知見がありません。</p>}
        {items.map((k) => (
          <Link key={k.id} href={`/knowledge/${k.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{k.title}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{k.issue}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {k.workCategory.slice(0, 2).map((c) => (
                <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                  {c}
                </span>
              ))}
              <StatusBadge status={k.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
