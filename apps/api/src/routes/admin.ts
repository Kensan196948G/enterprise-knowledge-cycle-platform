import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, systemSettings, roleEnum } from "../db/schema.js";
import { authGuard, requireRole } from "../middleware/auth-guard.js";
import { permissions } from "../lib/rbac.js";
import { getSettings } from "../lib/settings.js";
import { isAnthropicConfigured } from "../lib/ai-structuring.js";
import { recordAudit } from "../lib/audit.js";

export const adminRoutes = new Hono();

adminRoutes.use("*", authGuard);

/**
 * システム設定の読み取り。滞留アラートしきい値・MVPバナー表示・AIモデル名など
 * 非機密の運用設定のみを返す。閲覧は全ロール可(かんばん等の表示に必要なため)。
 * ANTHROPIC_API_KEY 自体の値は絶対に返さず、設定済みか否かの真偽値のみ返す。
 */
adminRoutes.get("/settings", async (c) => {
  const settings = await getSettings();
  return c.json({
    stagnationAlertDays: settings?.stagnationAlertDays ?? 3,
    showDemoBanner: settings?.showDemoBanner ?? true,
    aiModel: settings?.aiModel ?? "claude-sonnet-5",
    aiConfigured: isAnthropicConfigured(),
    updatedAt: settings?.updatedAt ?? null,
  });
});

const updateSettingsSchema = z.object({
  stagnationAlertDays: z.number().int().min(1).max(14).optional(),
  showDemoBanner: z.boolean().optional(),
  aiModel: z.string().min(1).max(120).optional(),
});

/** システム設定の変更: システム管理者のみ。変更は監査ログに記録する。 */
adminRoutes.patch("/settings", requireRole(permissions.manageAdmin), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }
  if (Object.keys(parsed.data).length === 0) {
    return c.json({ error: "変更内容がありません" }, 400);
  }

  await getSettings(); // 行が存在することを保証する
  const [updated] = await db
    .update(systemSettings)
    .set({ ...parsed.data, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(systemSettings.id, 1))
    .returning();

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "CONFIG_CHANGE",
    objectType: "system_settings",
    objectId: "1",
    reason: JSON.stringify(parsed.data),
  });

  return c.json({
    stagnationAlertDays: updated.stagnationAlertDays,
    showDemoBanner: updated.showDemoBanner,
    aiModel: updated.aiModel,
    aiConfigured: isAnthropicConfigured(),
    updatedAt: updated.updatedAt,
  });
});

/** ユーザー一覧: システム管理者のみ(役割変更UIのため) */
adminRoutes.get("/users", requireRole(permissions.manageAdmin), async (c) => {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, department: users.department, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);
  return c.json({ items: rows });
});

const updateUserSchema = z.object({
  role: z.enum(roleEnum.enumValues).optional(),
  department: z.string().max(120).nullable().optional(),
});

/** ユーザーのロール・部署の変更: システム管理者のみ。監査ログに記録する。 */
adminRoutes.patch("/users/:id", requireRole(permissions.manageAdmin), async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id") as string;
  const body = await c.req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }
  if (Object.keys(parsed.data).length === 0) {
    return c.json({ error: "変更内容がありません" }, 400);
  }

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return c.json({ error: "ユーザーが見つかりません" }, 404);

  const [updated] = await db
    .update(users)
    .set(parsed.data)
    .where(eq(users.id, id))
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, department: users.department });

  await recordAudit({
    actorId: actor.id,
    role: actor.role,
    action: "PERMISSION_CHANGE",
    objectType: "user",
    objectId: id,
    reason: `role: ${existing.role} -> ${updated.role}`,
  });

  return c.json(updated);
});
