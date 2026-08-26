import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://ekcp:ekcp@localhost:15544/ekcp";
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log("[migrate] applying migrations from src/db/migrations ...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
