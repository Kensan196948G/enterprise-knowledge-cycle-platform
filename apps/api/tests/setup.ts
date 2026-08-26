import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/auth.js";

export const TEST_PASSWORD = "Test#Pass2026";

export async function resetDatabase() {
  await db.execute(sql`
    truncate table
      audit_logs, usage_events, ai_executions, evidence_links,
      review_cases, knowledge_source_links, knowledge_items, sources, users
    restart identity cascade
  `);
}

export async function seedTestUsers() {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const roles = ["user", "contributor", "reviewer", "approver", "admin"] as const;
  const created: Record<string, { id: string; email: string }> = {};
  for (const role of roles) {
    const email = `${role}@test.local`;
    const [row] = await db
      .insert(users)
      .values({ name: `Test ${role}`, email, passwordHash, role })
      .returning();
    created[role] = { id: row.id, email };
  }
  return created;
}

export async function closeDb() {
  await pool.end();
}
