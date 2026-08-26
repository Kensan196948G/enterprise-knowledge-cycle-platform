"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeItem } from "@/lib/types";

/** UI-07 承認キュー: レビュー待ちの知見を一覧化する */
export default function ReviewQueuePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);

  useEffect(() => {
    api.listKnowledge({ status: "review_pending" }).then((r) => setItems(r.items));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">レビューキュー</h1>
      <p className="text-sm text-slate-500">レビュー待ちの知見候補 {items.length} 件</p>
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">レビュー待ちの知見はありません。</p>}
        {items.map((k) => (
          <Link key={k.id} href={`/knowledge/${k.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{k.title}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{k.issue}</p>
            </div>
            <StatusBadge status={k.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
