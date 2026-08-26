import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { systemSettings } from "../db/schema.js";

const SETTINGS_ID = 1;

/** システム設定のシングルトン行を取得する。未作成の場合は既定値で作成する。 */
export async function getSettings() {
  const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.id, SETTINGS_ID)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(systemSettings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.id, SETTINGS_ID)).limit(1);
  return row;
}
