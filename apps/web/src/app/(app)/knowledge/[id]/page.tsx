"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import { useAuth, hasAtLeastRole } from "@/lib/auth-context";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeDetail, KnowledgeItem } from "@/lib/types";

export default function KnowledgeDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [item, setItem] = useState<KnowledgeDetail | null>(null);
  const [similar, setSimilar] = useState<KnowledgeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const detail = await api.getKnowledge(params.id);
    setItem(detail);
    api.getSimilar(params.id).then((r) => setSimilar(r.items)).catch(() => undefined);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!item || !user) return <div className="text-sm text-slate-500">読み込み中...</div>;

  const pendingReview = item.reviews.find((r) => r.decision === "pending");

  async function run(action: () => Promise<unknown>, successMsg: string) {
    setBusy(true);
    setMessage(null);
    setConflictWarning(null);
    try {
      await action();
      setMessage(successMsg);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setMessage(err.message);
      else setMessage("操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onRequestReview() {
    await run(() => api.requestReview(item!.id), "レビュー依頼を送信しました。");
  }

  async function onApprove(ack = false) {
    if (!pendingReview) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.approve(pendingReview.id, ack);
      setMessage("承認しました。正式知見として登録されました。");
      setConflictWarning(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictWarning(["未解決の矛盾があります。内容を確認のうえ、再度「矛盾を確認のうえ承認」を押してください。"]);
      } else {
        setMessage(err instanceof ApiError ? err.message : "承認に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onReturn() {
    if (!pendingReview) return;
    const reason = window.prompt("差戻し理由を入力してください（必須）");
    if (!reason) return;
    await run(() => api.returnReview(pendingReview.id, reason), "差戻しました。");
  }

  async function onReject() {
    if (!pendingReview) return;
    const reason = window.prompt("却下理由を入力してください（必須）");
    if (!reason) return;
    await run(() => api.rejectReview(pendingReview.id, reason), "却下しました。");
  }

  async function onArchive() {
    const reason = window.prompt("廃止理由を入力してください（必須）");
    if (!reason) return;
    await run(() => api.archive(item!.id, reason), "廃止しました。");
  }

  async function onRevalidate() {
    const reason = window.prompt("再確認が必要な理由（基準版変更など）") ?? undefined;
    await run(() => api.revalidate(item!.id, reason), "再確認対象にしました。");
  }

  const canEdit = hasAtLeastRole(user.role, "contributor") && item.status !== "approved" && item.status !== "archived";
  const canRequestReview =
    hasAtLeastRole(user.role, "contributor") && ["draft", "ai_processed", "returned"].includes(item.status);
  const canReview = hasAtLeastRole(user.role, "reviewer") && item.status === "review_pending" && !!pendingReview;
  const canApprove = (user.role === "approver" || user.role === "admin") && item.status === "review_pending" && !!pendingReview;
  const canArchiveOrRevalidate = hasAtLeastRole(user.role, "approver") && item.status === "approved";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{item.title}</h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={item.status} />
            <span className="text-xs text-slate-400">v{item.version}</span>
            {item.projectSite && <span className="text-xs text-slate-500">案件: {item.projectSite}</span>}
          </div>
        </div>
        {item.aiConfidence !== null && (
          <div className="text-right text-xs text-slate-500">
            AI信頼度（参考値・承認の代替不可）
            <p className="text-lg font-bold text-aiRef">{Math.round(item.aiConfidence * 100)}%</p>
          </div>
        )}
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{message}</div>}
      {conflictWarning && (
        <div className="rounded-lg border border-orange-200 bg-warnBg px-4 py-2 text-sm text-warn">
          {conflictWarning.map((c, i) => (
            <p key={i}>⚠ {c}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="課題・事象" value={item.issue} />
        <Field label="原因" value={item.cause} unknown="原因に関する記述が確認できません（AIによる無断補完なし）" />
        <Field label="実施した対応" value={item.action} unknown="対応に関する記述が確認できません" />
        <Field label="結果" value={item.result} unknown="結果に関する記述が確認できません" />
        <Field label="適用条件" value={item.applicableConditions} unknown="適用条件は未記入です" />
        <Field label="注意・適用不可条件" value={item.exclusionConditions} />
      </div>

      {item.aiOutput && (item.aiOutput.unknowns.length > 0 || item.aiOutput.conflicts.length > 0) && (
        <div className="rounded-xl border border-orange-200 bg-warnBg p-4 text-sm text-warn">
          <p className="font-semibold">AIレビュー支援（要確認事項）</p>
          <ul className="mt-1 space-y-0.5">
            {item.aiOutput.unknowns.map((u, i) => (
              <li key={`u-${i}`}>・不明: {u}</li>
            ))}
            {item.aiOutput.conflicts.map((c, i) => (
              <li key={`c-${i}`}>・矛盾: {c}</li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">根拠資料（Evidence）</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {item.evidence.length === 0 && <p className="text-sm text-slate-400">根拠資料が登録されていません。</p>}
          <ul className="space-y-1 text-sm text-slate-700">
            {item.evidence.map((e) => (
              <li key={e.id}>
                ・{e.sourceTitle} {e.verified ? <span className="text-approved">(確認済)</span> : <span className="text-slate-400">(未確認)</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {canRequestReview && (
          <button disabled={busy} onClick={onRequestReview} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            レビュー依頼
          </button>
        )}
        {canReview && (
          <button disabled={busy} onClick={onReturn} className="rounded-lg border border-orange-300 bg-warnBg px-4 py-2 text-sm font-semibold text-warn hover:opacity-80 disabled:opacity-50">
            差戻し
          </button>
        )}
        {canApprove && (
          <>
            <button
              disabled={busy}
              onClick={() => onApprove(!!conflictWarning)}
              className="rounded-lg bg-approved px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {conflictWarning ? "矛盾を確認のうえ承認" : "承認"}
            </button>
            <button disabled={busy} onClick={onReject} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
              却下
            </button>
          </>
        )}
        {canArchiveOrRevalidate && (
          <>
            <button disabled={busy} onClick={onRevalidate} className="rounded-lg border border-orange-300 bg-warnBg px-4 py-2 text-sm font-semibold text-warn hover:opacity-80 disabled:opacity-50">
              再確認を要求
            </button>
            <button disabled={busy} onClick={onArchive} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              廃止
            </button>
          </>
        )}
        {canEdit && <EditToggle item={item} onSaved={load} />}
      </section>

      {item.reviews.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">レビュー履歴</h2>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {item.reviews.map((r) => (
              <div key={r.id} className="px-4 py-2 text-sm text-slate-700">
                <span className="font-medium">{DECISION_LABEL[r.decision]}</span>
                {r.reason && <span className="ml-2 text-slate-500">理由: {r.reason}</span>}
                <span className="ml-2 text-xs text-slate-400">{new Date(r.createdAt).toLocaleString("ja-JP")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">類似する承認済み知見</h2>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {similar.map((s) => (
              <Link key={s.id} href={`/knowledge/${s.id}`} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-50">
                <span>{s.title}</span>
                <StatusBadge status={s.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const DECISION_LABEL: Record<string, string> = {
  pending: "レビュー依頼中",
  approved: "承認",
  returned: "差戻し",
  rejected: "却下",
};

function Field({ label, value, unknown }: { label: string; value: string | null; unknown?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      {value ? (
        <p className="mt-1 text-sm text-slate-800">{value}</p>
      ) : (
        <p className="mt-1 text-sm italic text-slate-400">{unknown ?? "未記入"}</p>
      )}
    </div>
  );
}

function EditToggle({ item, onSaved }: { item: KnowledgeDetail; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    issue: item.issue,
    cause: item.cause ?? "",
    action: item.action ?? "",
    result: item.result ?? "",
    applicableConditions: item.applicableConditions ?? "",
    exclusionConditions: item.exclusionConditions ?? "",
  });
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
        内容を修正
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(form) as Array<keyof typeof form>).map((key) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-medium text-slate-600">{FIELD_LABEL[key]}</label>
            <textarea
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await api.updateKnowledge(item.id, form);
            await onSaved();
            setSaving(false);
            setOpen(false);
          }}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          保存
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600">
          キャンセル
        </button>
      </div>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  issue: "課題・事象",
  cause: "原因",
  action: "実施した対応",
  result: "結果",
  applicableConditions: "適用条件",
  exclusionConditions: "注意・適用不可条件",
};
