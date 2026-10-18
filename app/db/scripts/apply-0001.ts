import { getDb } from "../../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const stmts = [
    sql`ALTER TABLE news_items ADD severity int DEFAULT 2 NOT NULL`,
    sql`ALTER TABLE news_items ADD classifier varchar(20) DEFAULT 'rule-m1' NOT NULL`,
    sql`ALTER TABLE news_items ADD embedding text`,
  ];
  for (const s of stmts) {
    try { await db.execute(s); console.log("ok"); }
    catch (e) { console.log("skip:", (e as { cause?: { message?: string } }).cause?.message ?? e); }
  }
  process.exit(0);
}
main();
