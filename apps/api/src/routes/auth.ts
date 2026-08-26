import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { signToken, verifyPassword, isAuthOpen } from "../lib/auth.js";
import { recordAudit } from "../lib/audit.js";
import { authGuard } from "../middleware/auth-guard.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = new Hono();

/** 認証不要。フロントエンドがログイン画面を出すか自動ログインするかの判定に使う */
authRoutes.get("/mode", (c) => c.json({ open: isAuthOpen() }));

/**
 * AUTH_MODE=open のときのみ有効。パスワードを含まない安全な一覧を返し、
 * フロントエンドのロール切替UIが実在ユーザーを動的に表示できるようにする。
 */
authRoutes.get("/demo-users", async (c) => {
  if (!isAuthOpen()) return c.json({ error: "Not found" }, 404);
  const rows = await db
    .select({ email: users.email, name: users.name, role: users.role, department: users.department })
    .from(users);
  return c.json({ items: rows });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "email/password が不正です" }, 400);
  }
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  const passwordOk = isAuthOpen() ? !!user : !!user && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !passwordOk) {
    return c.json({ error: "認証に失敗しました" }, 401);
  }

  const token = signToken({ sub: user.id, role: user.role, name: user.name });
  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "LOGIN",
    objectType: "user",
    objectId: user.id,
  });

  return c.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, department: user.department, email: user.email },
  });
});

authRoutes.get("/me", authGuard, async (c) => {
  const authed = c.get("user");
  const [user] = await db.select().from(users).where(eq(users.id, authed.id)).limit(1);
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  return c.json({
    id: user.id,
    name: user.name,
    role: user.role,
    department: user.department,
    email: user.email,
  });
});
