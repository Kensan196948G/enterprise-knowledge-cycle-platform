/**
 * 詳細仕様設計書 §13 権限・認可設計 のマトリクスをコード化したもの。
 * ○=許可 / △=限定許可 / －=不可。MVPでは△を「許可するが監査ログに記録」として扱う。
 */
export type Role = "user" | "contributor" | "reviewer" | "approver" | "admin";

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  contributor: 1,
  reviewer: 2,
  approver: 3,
  admin: 4,
};

export function hasAtLeastRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * 削除可能なステータス。承認済み(approved)・要再確認(revalidation_required)・
 * 廃止済み(archived)は監査証跡・版管理(詳細仕様設計書§14)を保全するため、
 * 削除不可とし archive/revalidate フローのみで扱う。
 */
export const OWNER_DELETABLE_STATUSES = ["draft", "ai_processed", "returned"] as const;
export const APPROVER_DELETABLE_STATUSES = [
  "draft",
  "ai_processed",
  "review_pending",
  "returned",
  "rejected",
] as const;

export const permissions = {
  /** 承認済み知見閲覧: 全ロール可 */
  viewApproved: (_role: Role) => true,
  /** 一次情報登録: 一般利用者以上 (要件定義書 §4 一般利用者=登録可) */
  registerSource: (role: Role) => hasAtLeastRole(role, "user"),
  /**
   * AI構造化トリガー: 一般利用者以上。AI処理自体は「候補」を作るだけで
   * 正式知見にはならないため、登録と同じ権限境界とする(承認・編集が
   * 実際の統制ポイント)。
   */
  runAiStructuring: (role: Role) => hasAtLeastRole(role, "user"),
  /** 知見候補編集: contributor以上 (admin△は編集可だが監査記録) */
  editKnowledgeCandidate: (role: Role) => hasAtLeastRole(role, "contributor"),
  /** レビュー(差戻し含む): reviewer以上 */
  review: (role: Role) => hasAtLeastRole(role, "reviewer"),
  /** 正式承認: approver以上のみ (adminは原則不可、監査目的のみ許容しない) */
  approve: (role: Role) => role === "approver" || role === "admin",
  /** 廃止(archive)・再確認要求: approver以上 */
  archiveOrRevalidate: (role: Role) => hasAtLeastRole(role, "approver"),
  /** 自分が登録した知見の削除: contributor以上 (対象ステータスは呼び出し側で判定) */
  deleteOwnKnowledge: (role: Role) => hasAtLeastRole(role, "contributor"),
  /** 他者の知見も含めた削除: approver以上 */
  deleteAnyKnowledge: (role: Role) => hasAtLeastRole(role, "approver"),
  /** 監査ログ閲覧: approver以上 */
  viewAudit: (role: Role) => hasAtLeastRole(role, "approver"),
  /** KPI/分析閲覧: approver以上 */
  viewMetrics: (role: Role) => hasAtLeastRole(role, "approver"),
  /** AI/連携設定・ユーザー管理: adminのみ */
  manageAdmin: (role: Role) => role === "admin",
};
