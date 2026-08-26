import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export const healthRoutes = new Hono();

healthRoutes.get("/live", (c) => c.json({ status: "ok" }));

healthRoutes.get("/ready", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: "ok", db: "connected" });
  } catch (err) {
    return c.json({ status: "error", detail: String(err) }, 503);
  }
});
