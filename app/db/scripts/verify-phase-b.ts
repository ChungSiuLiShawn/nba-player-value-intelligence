import { getDb } from "../../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  // 1) 重分类结果抽样：之前误判的唐斯"谈判停滞"
  const towns = await db.execute(sql`SELECT title, category, sentiment, classifier FROM news_items WHERE title LIKE '%Extension talks stall%'`);
  console.log("=== 唐斯续约停滞（M0 曾误判合同利好）:");
  for (const r of towns[0] as unknown as Record<string, unknown>[]) console.log(" ", r.category, r.sentiment, r.classifier, "|", String(r.title).slice(0, 70));
  // 2) 事件聚类效果：伦纳德续约应有 4 条新闻归并到 1 个事件
  const kawhi = await db.execute(sql`
    SELECT e.id, e.item_count, e.best_source_tier, e.title FROM news_events e
    JOIN players p ON p.id = e.player_id WHERE p.name_en = 'Kawhi Leonard'`);
  console.log("=== 伦纳德事件聚类:");
  for (const r of kawhi[0] as unknown as Record<string, unknown>[]) console.log("  event", r.id, "items:", r.item_count, "tier:", r.best_source_tier, "|", String(r.title).slice(0, 60));
  // 3) 向量覆盖率
  const emb = await db.execute(sql`SELECT count(*) n FROM news_items WHERE embedding IS NOT NULL`);
  console.log("=== 有向量的新闻:", (emb[0] as unknown as { n: number }[])[0].n);
  // 4) 事件总数 vs 新闻总数
  const ev = await db.execute(sql`SELECT count(*) n FROM news_events`);
  const ni = await db.execute(sql`SELECT count(*) n FROM news_items`);
  console.log("=== 新闻", (ni[0] as unknown as { n: number }[])[0].n, "条 → 事件", (ev[0] as unknown as { n: number }[])[0].n, "个");
  process.exit(0);
}
main().catch((e) => { console.error(e.cause?.message ?? e); process.exit(1); });
