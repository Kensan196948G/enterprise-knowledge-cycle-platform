import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sources } from "../db/schema.js";
import { authGuard, requireRole } from "../middleware/auth-guard.js";
import { permissions } from "../lib/rbac.js";
import { contentHash } from "../lib/ai-structuring.js";
import { recordAudit } from "../lib/audit.js";

const createSourceSchema = z.object({
  title: z.string().min(1).max(300),
  sourceType: z.string().max(60).default("manual"),
  originSystem: z.string().max(120).default("web"),
  originalUri: z.string().url().optional(),
  contentText: z.string().min(1),
  projectSite: z.string().max(200).optional(),
  workCategory: z.array(z.string()).default([]),
  confidentiality: z.enum(["internal", "restricted", "confidential"]).default("internal"),
});

export const sourceRoutes = new Hono();

sourceRoutes.use("*", authGuard);

/** FR-01 情報登録: 一次情報(SourceDocument)の登録。原文は以後上書きしない。 */
sourceRoutes.post("/", requireRole(permissions.registerSource), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = createSourceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "入力値が不正です", details: parsed.error.flatten() }, 400);
  }

  const [created] = await db
    .insert(sources)
    .values({
      title: parsed.data.title,
      sourceType: parsed.data.sourceType,
      originSystem: parsed.data.originSystem,
      originalUri: parsed.data.originalUri,
      contentText: parsed.data.contentText,
      contentHash: contentHash(parsed.data.contentText),
      projectSite: parsed.data.projectSite,
      workCategory: parsed.data.workCategory,
      confidentiality: parsed.data.confidentiality,
      ownerId: user.id,
    })
    .returning();

  await recordAudit({
    actorId: user.id,
    role: user.role,
    action: "CREATE",
    objectType: "source",
    objectId: created.id,
  });

  return c.json(created, 201);
});

sourceRoutes.get("/", async (c) => {
  const rows = await db.select().from(sources).orderBy(desc(sources.createdAt)).limit(200);
  return c.json({ items: rows });
});

sourceRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  if (!row) return c.json({ error: "見つかりません" }, 404);
  return c.json(row);
});
