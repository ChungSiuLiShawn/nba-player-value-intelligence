import { getDb } from "../../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const cols = await db.execute(sql`SHOW COLUMNS FROM news_items`);
  console.log("cols:", (cols[0] as unknown as { Field: string }[]).map((c) => c.Field).join(","));
  const migs = await db.execute(sql`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at`);
  console.log("migrations applied:", (migs[0] as unknown as unknown[]).length);
  process.exit(0);
}
main().catch((e) => { console.error(e.cause?.message ?? e); process.exit(1); });
