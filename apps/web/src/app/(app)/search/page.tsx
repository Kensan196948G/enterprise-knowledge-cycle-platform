"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import type { SearchResultItem } from "@/lib/types";

function ResultCard({ item }: { item: SearchResultItem }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/knowledge/${item.id}`} className="text-sm font-semibold text-slate-900 hover:underline">
          {item.title}
        </Link>
        <StatusBadge status={item.status} />
      </div>
      {item.kind === "reference" && (
        <p className="mt-1 text-xs font-medium text-aiRef">※ 参考情報（未承認・AI生成候補）です。適用にあたっては必ずレビューを確認してください。</p>
      )}
      <p className="mt-2 text-sm text-slate-700">{item.issue}</p>
      {item.result && <p className="mt-1 text-sm text-slate-600">結果: {item.result}</p>}
      {item.applicableConditions && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-semibold">適用条件:</span> {item.applicableConditions}
        </p>
      )}
      {item.exclusionConditions && (
        <p className="mt-1 text-xs text-warn">
          <span className="font-semibold">注意・適用不可条件:</span> {item.exclusionConditions}
        </p>
      )}
      {item.evidence.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold text-slate-500">根拠資料</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
            {item.evidence.map((e, i) => (
              <li key={i}>・{e.sourceTitle}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [approved, setApproved] = useState<SearchResultItem[]>([]);
  const [reference, setReference] = useState<SearchResultItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setError(null);
    try {
      const res = await api.search(q);
      setApproved(res.approved);
      setReference(res.reference);
      setSearched(true);
    } catch {
      setError("検索に失敗しました");
    }
  }

  useEffect(() => {
    if (params.get("q")) runSearch(params.get("q") as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">検索・活用</h1>
        <p className="mt-1 text-sm text-slate-500">承認済み知見を優先表示します。未承認の候補は「参考情報」として区別して表示します。</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="質問または検索語を入力"
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
          />
          <button className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            検索
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {searched && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-approved">承認済み知見 ({approved.length}件)</h2>
            <div className="space-y-3">
              {approved.length === 0 && <p className="text-sm text-slate-400">該当する承認済み知見はありません。</p>}
              {approved.map((r) => (
                <ResultCard key={r.id} item={r} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-aiRef">参考情報（未承認候補） ({reference.length}件)</h2>
            <div className="space-y-3">
              {reference.map((r) => (
                <ResultCard key={r.id} item={r} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">読み込み中...</div>}>
      <SearchInner />
    </Suspense>
  );
}
