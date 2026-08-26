"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { KnowledgeItem } from "@/lib/types";

export default function RegisterPage() {
  const [title, setTitle] = useState("");
  const [projectSite, setProjectSite] = useState("");
  const [contentText, setContentText] = useState("");
  const [step, setStep] = useState<"input" | "structuring" | "done">("input");
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<KnowledgeItem | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("structuring");
    try {
      const source = await api.createSource({ title, contentText, projectSite: projectSite || undefined });
      const item = await api.createCandidate([source.id], title);
      setCandidate(item);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登録に失敗しました");
      setStep("input");
    }
  }

  if (step === "done" && candidate) {
    const ai = candidate.aiOutput;
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">AI構造化結果（確認）</h1>
        <p className="text-sm text-slate-500">
          この結果は<strong className="text-aiRef">AI生成の参考案</strong>です。正式な知見として登録するには、レビュー担当・承認権限者の確認が必要です。
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">facts（原文に明示された事実）</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {ai?.facts.map((f, i) => <li key={i}>・{f}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-aiRef">inferences（AI推論・事実と分離）</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {ai?.inferences.map((f, i) => <li key={i}>・{f}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-warn">unknowns（不明・要確認）</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {(ai?.unknowns.length ?? 0) === 0 && <li className="text-slate-400">なし</li>}
              {ai?.unknowns.map((f, i) => <li key={i}>・{f}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-red-600">conflicts（矛盾）</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {(ai?.conflicts.length ?? 0) === 0 && <li className="text-slate-400">なし</li>}
              {ai?.conflicts.map((f, i) => <li key={i}>・{f}</li>)}
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/knowledge/${candidate.id}`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            知見詳細でレビュー依頼へ進む
          </Link>
          <button
            onClick={() => {
              setStep("input");
              setCandidate(null);
              setTitle("");
              setContentText("");
              setProjectSite("");
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            続けて別の情報を登録する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">一次情報の登録</h1>
        <p className="mt-1 text-sm text-slate-500">
          日報・トラブル記録・検討結果などを登録すると、AIが自動で課題・原因・対応・結果を構造化します。
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">タイトル</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="例: ○○工事 コンクリート打設ひび割れ対応記録"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">案件・現場（任意）</label>
          <input
            value={projectSite}
            onChange={(e) => setProjectSite(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">内容（課題・原因・対応・結果・適用条件を含む自由記述）</label>
          <textarea
            required
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="課題: ... 原因: ... 対応: ... 結果: ... 適用条件: ... 注意: ..."
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={step === "structuring"}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {step === "structuring" ? "AI構造化中..." : "登録してAI構造化を実行"}
        </button>
      </form>
    </div>
  );
}
