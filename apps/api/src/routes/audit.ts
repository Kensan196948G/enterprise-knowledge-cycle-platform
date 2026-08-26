import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";
import { authGuard, requireRole } from "../middleware/auth-guard.js";
import { permissions } from "../lib/rbac.js";

export const auditRoutes = new Hono();
auditRoutes.use("*", authGuard, requireRole(permissions.viewAudit));

/** GET /api/v1/audit — 監査ログ検索 (Approver/Admin) */
auditRoutes.get("/", async (c) => {
  const objectType = c.req.query("objectType");
  const rows = objectType
    ? await db.select().from(auditLogs).where(eq(auditLogs.objectType, objectType)).orderBy(desc(auditLogs.timestamp)).limit(300)
    : await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(300);
  return c.json({ items: rows });
});
