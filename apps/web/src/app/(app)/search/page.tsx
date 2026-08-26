"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import type { SearchResultItem } from "@/lib/types";

const SUGGESTIONS = ["コンクリート ひび割れ", "仮設 波浪", "地盤改良 品質", "薬液注入 適用条件"];

function ApprovedCard({ item }: { item: SearchResultItem }) {
  return (
    <Link
      href={`/knowledge/${item.id}`}
      className="block rounded-[10px] border border-borderc border-l-[3px] border-l-approved bg-white p-4 shadow-sm hover:bg-[#FAFBFC]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="text-[13.5px] font-semibold text-ink">{item.title}</div>
        <StatusBadge status={item.status} />
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-subtle">{item.issue}</p>
      {item.applicableConditions && (
        <p className="mt-1.5 text-[11.5px] text-subtle">
          <span className="font-semibold">適用条件:</span> {item.applicableConditions}
        </p>
      )}
      {item.exclusionConditions && (
        <p className="mt-0.5 text-[11.5px] text-warn">
          <span className="font-semibold">注意・適用不可条件:</span> {item.exclusionConditions}
        </p>
      )}
      <p className="mt-2 border-t border-panel pt-1.5 text-[11px] text-muted">
        根拠資料: {item.evidence.map((e) => e.sourceTitle).join(" / ") || "なし"}
      </p>
    </Link>
  );
}

function ReferenceCard({ item }: { item: SearchResultItem }) {
  return (
    <Link
      href={`/knowledge/${item.id}`}
      className="block rounded-[10px] border border-dashed border-[#B9A8DD] bg-white p-4 hover:bg-[#FAFBFC]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="text-[13.5px] font-semibold text-ink">{item.title}</div>
        <StatusBadge status={item.status} />
      </div>
      <p className="mt-1 text-[11.5px] font-semibold text-aiRef">
        ※ 参考情報（未承認・AI生成候補）です。適用にあたっては必ずレビューを確認してください。
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-subtle">{item.issue}</p>
    </Link>
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
    <div className="mx-auto flex max-w-[840px] flex-col gap-[18px]">
      <div className="rounded-[10px] border border-borderc bg-white p-5 shadow-sm">
        <form
          className="flex gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 港湾工事でコンクリート打設時に発生した不具合と対策を教えて"
            aria-label="知見を検索"
            className="flex-1 rounded-[9px] border border-borderc px-3.5 py-2.5 text-[13.5px] outline-none focus:border-accent"
          />
          <button className="rounded-[9px] bg-accent px-6 text-[13.5px] font-semibold text-white hover:bg-accentHover">検索</button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-muted">よく検索される:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                runSearch(s);
              }}
              className="rounded-md border border-borderc bg-white px-2.5 py-1.5 text-xs text-subtle hover:bg-panel"
            >
              {s}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-reject">{error}</p>}
      </div>

      {!searched && (
        <p className="py-8 text-center text-[13px] text-muted">
          検索語を入力すると、<span className="font-semibold text-approved">承認済みの正式知見</span>を優先して表示します。未承認の候補は
          <span className="font-semibold text-aiRef">参考情報</span>として区別されます。
        </p>
      )}

      {searched && (
        <>
          <section>
            <h2 className="mb-2.5 text-[13px] font-semibold text-approved">承認済み知見（{approved.length}件）</h2>
            <div className="flex flex-col gap-2.5">
              {approved.length === 0 && <p className="text-[12.5px] text-muted">該当する承認済み知見はありません。</p>}
              {approved.map((r) => (
                <ApprovedCard key={r.id} item={r} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2.5 text-[13px] font-semibold text-aiRef">参考情報・未承認候補（{reference.length}件）</h2>
            <div className="flex flex-col gap-2.5">
              {reference.length === 0 && <p className="text-[12.5px] text-muted">該当する参考情報はありません。</p>}
              {reference.map((r) => (
                <ReferenceCard key={r.id} item={r} />
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
    <Suspense fallback={<div className="text-sm text-muted">読み込み中...</div>}>
      <SearchInner />
    </Suspense>
  );
}
