import type { Context, Next } from "hono";
import { verifyToken } from "../lib/auth.js";
import type { Role } from "../lib/rbac.js";

export interface AuthedUser {
  id: string;
  role: Role;
  name: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

export async function authGuard(c: Context, next: Next) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "認証が必要です" }, 401);
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    c.set("user", { id: payload.sub, role: payload.role, name: payload.name });
    await next();
  } catch {
    return c.json({ error: "トークンが無効です" }, 401);
  }
}

export function requireRole(check: (role: Role) => boolean) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user || !check(user.role)) {
      return c.json({ error: "権限がありません" }, 403);
    }
    await next();
  };
}
