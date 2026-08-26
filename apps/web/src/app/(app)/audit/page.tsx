"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { AuditLogEntry } from "@/lib/types";

/** 詳細仕様設計書 §14 監査・版管理設計: 誰が・いつ・何を・どの根拠で変更したかを表示する */
export default function AuditPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    api.audit().then((r) => setItems(r.items));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">監査ログ</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">日時</th>
              <th className="px-4 py-2">アクション</th>
              <th className="px-4 py-2">対象</th>
              <th className="px-4 py-2">実行者ロール</th>
              <th className="px-4 py-2">理由</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                  {new Date(i.timestamp).toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{i.action}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {i.objectType}
                  {i.objectId ? `:${i.objectId.slice(0, 8)}` : ""}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{i.role ?? "-"}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{i.reason ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">監査ログがありません。</p>}
      </div>
    </div>
  );
}
