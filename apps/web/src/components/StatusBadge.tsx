import type { KnowledgeStatus } from "@/lib/types";

/**
 * 詳細仕様設計書 §11 表示ルール:
 * 承認済み=緑系 / AI生成・参考=紫系 / 要確認=橙系。色だけに依存せず文言も併記する。
 */
const STATUS_META: Record<KnowledgeStatus, { label: string; className: string }> = {
  draft: { label: "下書き", className: "bg-gray-100 text-gray-700 border-gray-300" },
  ai_processed: { label: "AI構造化済み（参考）", className: "bg-aiRefBg text-aiRef border-purple-300" },
  review_pending: { label: "レビュー待ち", className: "bg-warnBg text-warn border-orange-300" },
  returned: { label: "差戻し", className: "bg-warnBg text-warn border-orange-300" },
  approved: { label: "承認済み（正式知見）", className: "bg-approvedBg text-approved border-green-300" },
  rejected: { label: "却下", className: "bg-red-50 text-red-700 border-red-300" },
  revalidation_required: { label: "要再確認", className: "bg-warnBg text-warn border-orange-300" },
  archived: { label: "廃止（旧版）", className: "bg-gray-100 text-gray-500 border-gray-300" },
};

export function StatusBadge({ status }: { status: KnowledgeStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}
