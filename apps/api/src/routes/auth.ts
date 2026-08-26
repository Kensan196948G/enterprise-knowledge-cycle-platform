import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { signToken, verifyPassword } from "../lib/auth.js";
import { recordAudit } from "../lib/audit.js";
import { authGuard } from "../middleware/auth-guard.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = new Hono();

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

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
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
    user: { id: user.id, name: user.name, role: user.role, department: user.department },
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
