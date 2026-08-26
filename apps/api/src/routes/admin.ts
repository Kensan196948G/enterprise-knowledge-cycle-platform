import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, systemSettings, roleEnum } from "../db/schema.js";
import { authGuard, requireRole } from "../middleware/auth-guard.js";
import { permissions } from "../lib/rbac.js";
import { getSettings } from "../lib/settings.js";
import { isAnthropicConfigured } from "../lib/ai-structuring.js";
import { recordAudit } from "../lib/audit.js";
import { hashPassword } from "../lib/auth.js";

/** node-postgres が付与するエラーコード。参照: https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

/** DrizzleQueryError は元のpgエラーを .cause に包むため、両方を確認する */
function pgErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  if ("cause" in err) return pgErrorCode((err as { cause: unknown }).cause);
  return undefined;
}

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

/**
 * システム設定の変更: システム管理者のみ。設定更新と監査記録を同一
 * トランザクションで確定する(監査insertが失敗した場合は設定変更も
 * ロールバックされる)。
 */
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

  const updated = await db.transaction(async (tx) => {
    await getSettings(tx); // 行が存在することを保証する
    const [row] = await tx
      .update(systemSettings)
      .set({ ...parsed.data, updatedBy: user.id, updatedAt: new Date() })
      .where(eq(systemSettings.id, 1))
      .returning();

    await recordAudit(
      {
        actorId: user.id,
        role: user.role,
        action: "CONFIG_CHANGE",
        objectType: "system_settings",
        objectId: "1",
        reason: JSON.stringify(parsed.data),
      },
      tx,
    );
    return row;
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

const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  role: z.enum(roleEnum.enumValues),
  department: z.string().max(120).nullable().optional(),
  password: z.string().min(8).max(200),
});

/** ユーザーの新規作成: システム管理者のみ。作成は監査ログに記録する。 */
adminRoutes.post("/users", requireRole(permissions.manageAdmin), async (c) => {
  const actor = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }

  try {
    const created = await db.transaction(async (tx) => {
      const passwordHash = await hashPassword(parsed.data.password);
      const [row] = await tx
        .insert(users)
        .values({
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash,
          role: parsed.data.role,
          department: parsed.data.department ?? null,
        })
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role, department: users.department, createdAt: users.createdAt });

      await recordAudit(
        {
          actorId: actor.id,
          role: actor.role,
          action: "CREATE",
          objectType: "user",
          objectId: row.id,
          reason: `role: ${row.role}`,
        },
        tx,
      );
      return row;
    });

    return c.json(created, 201);
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
      return c.json({ error: "このメールアドレスは既に使用されています" }, 409);
    }
    throw err;
  }
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200).optional(),
  role: z.enum(roleEnum.enumValues).optional(),
  department: z.string().max(120).nullable().optional(),
});

const userIdParamSchema = z.string().uuid();

/**
 * ユーザーのロール・部署の変更: システム管理者のみ。対象行をロックしたうえで
 * 更新と監査記録を同一トランザクションで確定する。最後の管理者を降格させる
 * 変更は拒否する(管理者が0人になる状態を防ぐ)。
 */
adminRoutes.patch("/users/:id", requireRole(permissions.manageAdmin), async (c) => {
  const actor = c.get("user");
  const idParsed = userIdParamSchema.safeParse(c.req.param("id"));
  if (!idParsed.success) {
    return c.json({ error: "ユーザーIDが不正です" }, 400);
  }
  const id = idParsed.data;
  const body = await c.req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }
  if (Object.keys(parsed.data).length === 0) {
    return c.json({ error: "変更内容がありません" }, 400);
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!existing) {
        throw new HTTPException(404, { message: "ユーザーが見つかりません" });
      }

      if (existing.role === "admin" && parsed.data.role && parsed.data.role !== "admin") {
        // 異なるadminユーザーの同時降格が両方とも「admin>=2」を読んで両方成功する
        // (admin 0人になる)ことを防ぐため、この不変条件のチェックはアドバイザリ
        // ロックで直列化する(対象行のFOR UPDATEは対象行自身のみを保護するため不十分)。
        await tx.execute(sql`select pg_advisory_xact_lock(872346123)`);
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.role, "admin"));
        if (count <= 1) {
          throw new HTTPException(409, { message: "最後のシステム管理者のロールは変更できません" });
        }
      }

      const [row] = await tx
        .update(users)
        .set(parsed.data)
        .where(eq(users.id, id))
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role, department: users.department });

      await recordAudit(
        {
          actorId: actor.id,
          role: actor.role,
          action: "PERMISSION_CHANGE",
          objectType: "user",
          objectId: id,
          reason: `role: ${existing.role} -> ${row.role}`,
        },
        tx,
      );
      return row;
    });

    return c.json(updated);
  } catch (err) {
    if (err instanceof HTTPException) return err.getResponse();
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
      return c.json({ error: "このメールアドレスは既に使用されています" }, 409);
    }
    throw err;
  }
});

/**
 * ユーザーの削除: システム管理者のみ。自分自身の削除・最後の管理者の削除は
 * 拒否する。知見・登録データが関連付けられているユーザーは外部キー制約により
 * 削除できないため、409で分かりやすいエラーを返す(監査証跡・版管理を保全する
 * ため、関連データの強制削除は行わない)。
 */
adminRoutes.delete("/users/:id", requireRole(permissions.manageAdmin), async (c) => {
  const actor = c.get("user");
  const idParsed = userIdParamSchema.safeParse(c.req.param("id"));
  if (!idParsed.success) {
    return c.json({ error: "ユーザーIDが不正です" }, 400);
  }
  const id = idParsed.data;

  if (id === actor.id) {
    return c.json({ error: "自分自身を削除することはできません" }, 409);
  }

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!existing) {
        throw new HTTPException(404, { message: "ユーザーが見つかりません" });
      }

      if (existing.role === "admin") {
        await tx.execute(sql`select pg_advisory_xact_lock(872346123)`);
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.role, "admin"));
        if (count <= 1) {
          throw new HTTPException(409, { message: "最後のシステム管理者は削除できません" });
        }
      }

      await recordAudit(
        {
          actorId: actor.id,
          role: actor.role,
          action: "DELETE",
          objectType: "user",
          objectId: id,
          reason: `email: ${existing.email}`,
        },
        tx,
      );

      await tx.delete(users).where(eq(users.id, id));
    });

    return c.body(null, 204);
  } catch (err) {
    if (err instanceof HTTPException) return err.getResponse();
    if (pgErrorCode(err) === PG_FOREIGN_KEY_VIOLATION) {
      return c.json({ error: "このユーザーには関連する操作履歴・登録データ（監査ログ・知見・一次情報等）が存在するため削除できません" }, 409);
    }
    throw err;
  }
});
