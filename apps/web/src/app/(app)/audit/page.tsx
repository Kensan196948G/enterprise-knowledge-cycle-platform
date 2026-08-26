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
    <div className="mx-auto max-w-[1000px] overflow-hidden rounded-[10px] border border-borderc bg-white shadow-sm">
      <div className="grid grid-cols-[110px_190px_1fr_130px_1fr] gap-0 border-b border-panel bg-[#FAFBFC] px-4 py-2.5 text-[11px] font-semibold text-muted">
        <span>日時</span>
        <span>アクション</span>
        <span>対象</span>
        <span>実行者ロール</span>
        <span>理由</span>
      </div>
      {items.map((i) => (
        <div key={i.id} className="grid grid-cols-[110px_190px_1fr_130px_1fr] items-center gap-0 border-b border-panel px-4 py-2.5 text-xs last:border-b-0">
          <span className="font-mono text-[11.5px] text-muted">{new Date(i.timestamp).toLocaleString("ja-JP")}</span>
          <span className="truncate font-mono text-[11.5px] font-semibold text-subtle">{i.action}</span>
          <span className="truncate text-subtle">
            {i.objectType}
            {i.objectId ? `:${i.objectId.slice(0, 8)}` : ""}
          </span>
          <span className="text-subtle">{i.role ?? "-"}</span>
          <span className="truncate text-muted">{i.reason ?? "-"}</span>
        </div>
      ))}
      {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">監査ログがありません。</p>}
    </div>
  );
}
