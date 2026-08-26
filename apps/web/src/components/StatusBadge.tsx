import type { KnowledgeStatus } from "@/lib/types";

/**
 * 詳細仕様設計書 §11 表示ルール:
 * 承認済み=緑系 / AI生成・参考=紫系 / 要確認=橙系。色だけに依存せず文言も併記する。
 */
const STATUS_META: Record<KnowledgeStatus, { label: string; className: string }> = {
  draft: { label: "下書き", className: "bg-panel text-subtle" },
  ai_processed: { label: "AI構造化済み（参考）", className: "bg-aiRefBg text-aiRef" },
  review_pending: { label: "レビュー待ち", className: "bg-warnBg text-warn" },
  returned: { label: "差戻し", className: "bg-warnBg text-warn" },
  approved: { label: "承認済み（正式知見）", className: "bg-approvedBg text-approved" },
  rejected: { label: "却下", className: "bg-rejectBg text-reject" },
  revalidation_required: { label: "要再確認", className: "bg-warnBg text-warn" },
  archived: { label: "廃止（旧版）", className: "bg-panel text-muted" },
};

export function StatusBadge({ status }: { status: KnowledgeStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}
