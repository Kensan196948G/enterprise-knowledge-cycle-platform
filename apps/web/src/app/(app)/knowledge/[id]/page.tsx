"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import { useAuth, hasAtLeastRole, canDeleteKnowledge } from "@/lib/auth-context";
import { StatusBadge } from "@/components/StatusBadge";
import type { KnowledgeDetail, KnowledgeItem } from "@/lib/types";

type ReasonKind = "return" | "reject" | "revalidate" | "archive";

const REASON_LABELS: Record<ReasonKind, string> = {
  return: "差戻し理由（必須）",
  reject: "却下理由（必須）",
  revalidate: "再確認が必要な理由（基準版変更など）",
  archive: "廃止理由（必須）",
};

export default function KnowledgeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<KnowledgeDetail | null>(null);
  const [similar, setSimilar] = useState<KnowledgeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ackConflict, setAckConflict] = useState(false);
  const [reasonFor, setReasonFor] = useState<ReasonKind | null>(null);
  const [reasonText, setReasonText] = useState("");

  const load = useCallback(async () => {
    const detail = await api.getKnowledge(params.id);
    setItem(detail);
    api.getSimilar(params.id).then((r) => setSimilar(r.items)).catch(() => undefined);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!item || !user) return <div className="text-sm text-muted">読み込み中...</div>;

  const pendingReview = item.reviews.find((r) => r.decision === "pending");

  async function run(action: () => Promise<unknown>, successMsg: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(successMsg);
      setReasonFor(null);
      setReasonText("");
      setAckConflict(false);
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

  async function onApprove() {
    if (!pendingReview) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.approve(pendingReview.id, ackConflict);
      setMessage("承認しました。正式知見として登録されました。");
      setAckConflict(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAckConflict(true);
      } else {
        setMessage(err instanceof ApiError ? err.message : "承認に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  }

  function openReason(kind: ReasonKind) {
    setReasonFor(kind);
    setReasonText("");
    setMessage(null);
  }

  async function confirmReason() {
    if (!reasonFor) return;
    const txt = reasonText.trim();
    if (!txt && reasonFor !== "revalidate") {
      setMessage("理由の入力が必要です。");
      return;
    }
    if (reasonFor === "return") {
      if (!pendingReview) return;
      await run(() => api.returnReview(pendingReview.id, txt), "差戻しました。");
    } else if (reasonFor === "reject") {
      if (!pendingReview) return;
      await run(() => api.rejectReview(pendingReview.id, txt), "却下しました。");
    } else if (reasonFor === "revalidate") {
      await run(() => api.revalidate(item!.id, txt || undefined), "再確認対象にしました。");
    } else if (reasonFor === "archive") {
      await run(() => api.archive(item!.id, txt), "廃止しました。");
    }
  }

  const canEdit = hasAtLeastRole(user.role, "contributor") && item.status !== "approved" && item.status !== "archived";
  const canRequestReview =
    hasAtLeastRole(user.role, "contributor") && ["draft", "ai_processed", "returned"].includes(item.status);
  const canReview = hasAtLeastRole(user.role, "reviewer") && item.status === "review_pending" && !!pendingReview;
  const canApprove = (user.role === "approver" || user.role === "admin") && item.status === "review_pending" && !!pendingReview;
  const canArchiveOrRevalidate = hasAtLeastRole(user.role, "approver") && item.status === "approved";
  const canDelete = canDeleteKnowledge(user.role, item.status, item.createdBy === user.id);
  const hasAiIssues = !!item.aiOutput && (item.aiOutput.unknowns.length > 0 || item.aiOutput.conflicts.length > 0);

  async function onDelete() {
    if (!window.confirm("この知見を削除します。この操作は取り消せません。よろしいですか？")) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.deleteKnowledge(item!.id);
      router.push("/knowledge");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "削除に失敗しました");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4">
      <div>
        <Link href="/knowledge" className="text-[12.5px] text-subtle hover:underline">
          ← 知見一覧へ戻る
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-bold leading-snug text-ink">{item.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <StatusBadge status={item.status} />
            <span className="font-mono text-[11.5px] text-muted">v{item.version}</span>
            {item.projectSite && <span className="text-[11.5px] text-subtle">案件: {item.projectSite}</span>}
            <span className="text-[11.5px] text-muted">登録日: {new Date(item.createdAt).toLocaleDateString("ja-JP")}</span>
          </div>
        </div>
        {item.aiConfidence !== null && (
          <div className="shrink-0 rounded-[10px] bg-aiRefBg px-3.5 py-2.5 text-right">
            <div className="text-[10.5px] text-aiRef">AI信頼度（参考値・承認の代替不可）</div>
            <div className="text-xl font-bold tabular-nums text-aiRef">{Math.round(item.aiConfidence * 100)}%</div>
          </div>
        )}
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{message}</div>}
      {ackConflict && (
        <div className="rounded-lg border border-orange-200 bg-warnBg px-3.5 py-2.5 text-[13px] text-warn">
          ⚠ 未解決の矛盾があります。内容を確認のうえ、再度「矛盾を確認のうえ承認」を押してください。
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="課題・事象" value={item.issue} />
        <Field label="原因" value={item.cause} unknown="原因に関する記述が確認できません（AIによる無断補完なし）" />
        <Field label="実施した対応" value={item.action} unknown="対応に関する記述が確認できません" />
        <Field label="結果" value={item.result} unknown="結果に関する記述が確認できません" />
        <Field label="適用条件" value={item.applicableConditions} unknown="適用条件は未記入です" />
        <Field label="注意・適用不可条件" value={item.exclusionConditions} />
      </div>

      {hasAiIssues && (
        <div className="rounded-[10px] border border-orange-200 bg-warnBg p-3.5 text-[12.5px] text-warn">
          <p className="mb-1.5 font-semibold">AIレビュー支援（要確認事項）</p>
          {item.aiOutput!.unknowns.map((u, i) => (
            <p key={`u-${i}`} className="leading-relaxed">
              ・不明: {u}
            </p>
          ))}
          {item.aiOutput!.conflicts.map((c, i) => (
            <p key={`c-${i}`} className="leading-relaxed">
              ・矛盾: {c}
            </p>
          ))}
        </div>
      )}

      <section className="rounded-[10px] border border-borderc bg-white shadow-sm">
        <div className="border-b border-panel px-4 py-3 text-[13px] font-semibold text-ink">根拠資料（Evidence）</div>
        <div className="flex flex-col gap-1.5 px-4 py-3">
          {item.evidence.length === 0 && <p className="text-[12.5px] text-muted">根拠資料が登録されていません。</p>}
          {item.evidence.map((e) => (
            <p key={e.id} className="text-[12.5px] text-ink">
              ・{e.sourceTitle}{" "}
              <span className={e.verified ? "font-semibold text-approved" : "text-muted"}>{e.verified ? "(確認済)" : "(未確認)"}</span>
            </p>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-2.5">
        {canRequestReview && (
          <button disabled={busy} onClick={onRequestReview} className="rounded-lg border border-accent bg-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-accentHover disabled:opacity-50">
            レビュー依頼
          </button>
        )}
        {canReview && (
          <button disabled={busy} onClick={() => openReason("return")} className="rounded-lg border border-orange-200 bg-warnBg px-4 py-2 text-[12.5px] font-semibold text-warn hover:opacity-80 disabled:opacity-50">
            差戻し
          </button>
        )}
        {canApprove && (
          <>
            <button
              disabled={busy}
              onClick={onApprove}
              className="rounded-lg bg-approved px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {ackConflict ? "矛盾を確認のうえ承認" : "承認"}
            </button>
            <button disabled={busy} onClick={() => openReason("reject")} className="rounded-lg border border-red-200 bg-rejectBg px-4 py-2 text-[12.5px] font-semibold text-reject hover:opacity-80 disabled:opacity-50">
              却下
            </button>
          </>
        )}
        {canArchiveOrRevalidate && (
          <>
            <button disabled={busy} onClick={() => openReason("revalidate")} className="rounded-lg border border-orange-200 bg-warnBg px-4 py-2 text-[12.5px] font-semibold text-warn hover:opacity-80 disabled:opacity-50">
              再確認を要求
            </button>
            <button disabled={busy} onClick={() => openReason("archive")} className="rounded-lg border border-borderc px-4 py-2 text-[12.5px] font-semibold text-subtle hover:bg-panel disabled:opacity-50">
              廃止
            </button>
          </>
        )}
        {canEdit && <EditToggle item={item} onSaved={load} />}
        {canDelete && (
          <button
            disabled={busy}
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-[12.5px] font-semibold text-reject hover:bg-rejectBg disabled:opacity-50"
          >
            削除
          </button>
        )}
      </section>

      {reasonFor && (
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-accent bg-white p-4">
          <div className="text-[13px] font-semibold text-ink">{REASON_LABELS[reasonFor]}</div>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            rows={2}
            placeholder="理由を入力（監査ログに記録されます）"
            className="resize-y rounded-lg border border-borderc px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={confirmReason}
              className="rounded-lg border border-accent bg-accent px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              確定
            </button>
            <button
              onClick={() => {
                setReasonFor(null);
                setReasonText("");
              }}
              className="rounded-lg border border-borderc px-4 py-2 text-[12.5px] font-semibold text-subtle"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {item.reviews.length > 0 && (
        <section className="rounded-[10px] border border-borderc bg-white shadow-sm">
          <div className="border-b border-panel px-4 py-3 text-[13px] font-semibold text-ink">レビュー履歴</div>
          {item.reviews.map((r) => (
            <div key={r.id} className="flex items-baseline gap-2.5 border-b border-panel px-4 py-2.5 text-[12.5px] last:border-b-0">
              <span className="font-semibold text-ink">{DECISION_LABEL[r.decision]}</span>
              {r.reason && <span className="flex-1 text-subtle">理由: {r.reason}</span>}
              {!r.reason && <span className="flex-1" />}
              <span className="font-mono text-[11px] text-muted">{new Date(r.createdAt).toLocaleString("ja-JP")}</span>
            </div>
          ))}
        </section>
      )}

      {similar.length > 0 && (
        <section className="rounded-[10px] border border-borderc bg-white shadow-sm">
          <div className="border-b border-panel px-4 py-3 text-[13px] font-semibold text-ink">類似する承認済み知見</div>
          {similar.map((s) => (
            <Link
              key={s.id}
              href={`/knowledge/${s.id}`}
              className="flex items-center justify-between gap-2.5 border-b border-panel px-4 py-2.5 last:border-b-0 hover:bg-[#FAFBFC]"
            >
              <span className="text-[12.5px] text-ink">{s.title}</span>
              <StatusBadge status={s.status} />
            </Link>
          ))}
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
    <div className="rounded-[10px] border border-borderc bg-white p-3.5 shadow-sm">
      <p className="text-[11px] font-semibold text-muted">{label}</p>
      {value ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{value}</p>
      ) : (
        <p className="mt-1.5 text-[13px] italic leading-relaxed text-[#A2AEBC]">{unknown ?? "未記入"}</p>
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
      <button onClick={() => setOpen(true)} className="rounded-lg border border-borderc px-4 py-2 text-[12.5px] font-semibold text-subtle hover:bg-panel">
        内容を修正
      </button>
    );
  }

  return (
    <div className="w-full rounded-[10px] border border-borderc bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(form) as Array<keyof typeof form>).map((key) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-medium text-subtle">{FIELD_LABEL[key]}</label>
            <textarea
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-borderc px-2 py-1.5 text-sm outline-none focus:border-accent"
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
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accentHover disabled:opacity-50"
        >
          保存
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-borderc px-4 py-1.5 text-sm text-subtle">
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
