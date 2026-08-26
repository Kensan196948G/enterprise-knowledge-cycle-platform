const ROLE_RANK: Record<string, number> = { user: 0, contributor: 1, reviewer: 2, approver: 3, admin: 4 };

export function hasAtLeastRole(role: string | undefined, minimum: string): boolean {
  if (!role) return false;
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minimum] ?? 99);
}

/** apps/api/src/lib/rbac.ts と対になる削除可否判定(表示制御専用。最終判定はAPI側)。 */
const OWNER_DELETABLE_STATUSES = new Set(["draft", "ai_processed", "returned"]);
const APPROVER_DELETABLE_STATUSES = new Set(["draft", "ai_processed", "review_pending", "returned", "rejected"]);

export function canDeleteKnowledge(
  role: string | undefined,
  status: string,
  isOwner: boolean,
): boolean {
  if (!role) return false;
  if (hasAtLeastRole(role, "approver") && APPROVER_DELETABLE_STATUSES.has(status)) return true;
  if (isOwner && hasAtLeastRole(role, "contributor") && OWNER_DELETABLE_STATUSES.has(status)) return true;
  return false;
}
