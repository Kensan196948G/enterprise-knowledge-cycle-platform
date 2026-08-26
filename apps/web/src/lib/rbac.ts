const ROLE_RANK: Record<string, number> = { user: 0, contributor: 1, reviewer: 2, approver: 3, admin: 4 };

export function hasAtLeastRole(role: string | undefined, minimum: string): boolean {
  if (!role) return false;
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minimum] ?? 99);
}
