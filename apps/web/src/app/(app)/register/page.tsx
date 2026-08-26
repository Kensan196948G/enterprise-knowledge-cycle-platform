"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  ai_processed: "AI構造化済み（参考）",
  review_pending: "レビュー待ち",
  returned: "差戻し",
  approved: "承認済み（正式知見）",
  rejected: "却下",
  revalidation_required: "要再確認",
  archived: "廃止（旧版）",
};

interface ParsedPreview {
  fields: Array<{ label: string; text: string | null }>;
  unknowns: string[];
  confidence: number;
}

const FIELD_DEFS: Array<[key: string, label: string]> = [
  ["issue", "課題"],
  ["cause", "原因"],
  ["action", "対応"],
  ["result", "結果"],
  ["applicable", "適用条件"],
  ["exclusion", "注意"],
];

const FIELD_DISPLAY_LABEL: Record<string, string> = {
  issue: "課題・事象",
  cause: "原因",
  action: "実施した対応",
  result: "結果",
  applicable: "適用条件",
  exclusion: "注意・適用不可条件",
};

function parsePreview(text: string): ParsedPreview {
  const out: Record<string, string | null> = { issue: null, cause: null, action: null, result: null, applicable: null, exclusion: null };
  const marks: Array<{ key: string; start: number; len: number }> = [];
  for (const [key, label] of FIELD_DEFS) {
    const m = text.match(new RegExp(`${label}\\s*[:：]`));
    if (m && m.index !== undefined) marks.push({ key, start: m.index, len: m[0].length });
  }
  marks.sort((a, b) => a.start - b.start);
  if (marks.length === 0) {
    out.issue = text.trim() || null;
  } else {
    marks.forEach((m, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
      out[m.key] = text.slice(m.start + m.len, end).trim() || null;
    });
    if (!out.issue && marks[0].start > 0) out.issue = text.slice(0, marks[0].start).trim() || null;
  }
  const unknowns: string[] = [];
  if (!out.cause) unknowns.push("原因に関する記述が確認できません");
  if (!out.action) unknowns.push("対応に関する記述が確認できません");
  if (!out.result) unknowns.push("結果に関する記述が確認できません");
  const found = FIELD_DEFS.filter(([key]) => out[key]).length;
  const confidence = text.trim() ? Math.min(0.5 + found * 0.07 + Math.min(text.length / 2000, 0.13), 0.95) : 0;
  return {
    fields: FIELD_DEFS.map(([key, label]) => ({ label: FIELD_DISPLAY_LABEL[key] ?? label, text: out[key] })),
    unknowns,
    confidence,
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [projectSite, setProjectSite] = useState("");
  const [contentText, setContentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => parsePreview(contentText), [contentText]);
  const empty = !contentText.trim();

  const [similar, setSimilar] = useState<Array<{ id: string; title: string; status: string; score: number }>>([]);
  useEffect(() => {
    if (contentText.trim().length < 15) {
      setSimilar([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .findSimilarByText(contentText)
        .then((r) => setSimilar(r.items))
        .catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [contentText]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !contentText.trim()) {
      setError("タイトルと内容を入力してください。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const source = await api.createSource({ title, contentText, projectSite: projectSite || undefined });
      const item = await api.createCandidate([source.id], title);
      router.push(`/knowledge/${item.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登録に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5 rounded-[10px] border border-borderc bg-white p-5 shadow-sm">
        <div>
          <div className="text-[15px] font-semibold text-ink">一次情報の登録</div>
          <div className="mt-1 text-xs leading-relaxed text-muted">
            日報・トラブル記録・検討結果などを思ったまま書いてください。書いた内容は右側でAIがその場で整理します。
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-subtle">タイトル</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: ○○工事 コンクリート打設ひび割れ対応記録"
            className="rounded-lg border border-borderc px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-subtle">案件・現場（任意）</label>
          <input
            value={projectSite}
            onChange={(e) => setProjectSite(e.target.value)}
            className="rounded-lg border border-borderc px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-subtle">内容（自由記述）</label>
          <textarea
            required
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            rows={12}
            placeholder={"課題: … 原因: … 対応: … 結果: … 適用条件: … 注意: …\n（ラベルが無くてもAIが読み取ります）"}
            className="resize-y rounded-lg border border-borderc px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-accent"
          />
        </div>
        {error && <p className="text-sm text-reject">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg border border-accent bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accentHover disabled:opacity-50"
        >
          {submitting ? "AI構造化中..." : "登録してAI構造化を確定する"}
        </button>
      </form>

      <div className="flex flex-col gap-4 lg:sticky lg:top-0">
        {similar.length > 0 && (
          <div className="overflow-hidden rounded-[10px] border border-orange-200 bg-white">
            <div className="bg-warnBg px-4 py-2.5 text-[12.5px] font-semibold text-warn">
              ⚠ 類似の可能性がある既存知見（{similar.length}件）
            </div>
            <div className="flex flex-col">
              {similar.map((s) => (
                <Link
                  key={s.id}
                  href={`/knowledge/${s.id}`}
                  target="_blank"
                  className="flex items-center gap-2.5 border-b border-panel px-4 py-2.5 text-[12px] last:border-b-0 hover:bg-panel"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{s.title}</span>
                  <span className="shrink-0 text-[10.5px] text-muted">{STATUS_LABEL[s.status] ?? s.status}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="overflow-hidden rounded-[10px] border border-[#B9A8DD] bg-white">
          <div className="flex items-center gap-2.5 bg-aiRefBg px-4 py-3.5">
            <span className="text-[13px] font-semibold text-aiRef">🤖 AIライブプレビュー（参考案）</span>
            <div className="flex-1" />
            <span className="font-mono text-[11px] font-semibold text-aiRef">
              信頼度 {empty ? "—" : `${Math.round(preview.confidence * 100)}%`}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 p-4">
            {empty && (
              <p className="text-[12.5px] leading-relaxed text-muted">
                左に書き始めると、AIが「課題・原因・対応・結果・適用条件」に整理した下書きがここに表示されます。
                <br />
                <br />
                AIは原文にない内容を補完しません。読み取れない項目は「不明」として明示されます。
              </p>
            )}
            {!empty &&
              preview.fields.map((f) => (
                <div key={f.label}>
                  <div className="text-[11px] font-semibold text-aiRef">{f.label}</div>
                  <div className={`mt-0.5 text-[12.5px] leading-relaxed ${f.text ? "text-ink" : "italic text-[#A2AEBC]"}`}>
                    {f.text ?? "不明（原文に記述なし）"}
                  </div>
                </div>
              ))}
            {!empty && preview.unknowns.length > 0 && (
              <div className="rounded-lg bg-warnBg px-3 py-2.5 text-[11.5px] leading-relaxed text-warn">
                <span className="font-semibold">不明・要確認:</span> {preview.unknowns.join(" / ")}
              </div>
            )}
            {!empty && (
              <div className="border-t border-panel pt-2.5 text-[11px] leading-relaxed text-muted">
                この下書きは<span className="font-semibold text-aiRef">AI生成の参考案</span>
                です。正式な知見になるには、レビュー担当と承認権限者の確認が必要です。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
