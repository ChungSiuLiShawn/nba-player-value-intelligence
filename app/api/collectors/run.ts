import cron from "node-cron";
import { getDb } from "../queries/connection";
import { newsEvents, newsItems, players, sentimentDaily, sourceHealth } from "@db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { dedupKey, politeDelay, type SourceResult } from "./base";
import { runEspn } from "./espn";
import { runNba } from "./nba";
import { runShams } from "./shams";
import { loadPlayerRefs, matchPlayers } from "./match";
import { classifyArticle, isRumor } from "./classify";
import { assignEvent, clusterAllUnassigned } from "./events";
import { NEWS_WINDOW_DAYS, sentimentWeight } from "@contracts/sentiment";
import { runAnchorCalibration, runDailyEngine } from "../engine/m0";
import { syncSeasonStats } from "./stats";
import { runTier2 } from "./tier2";

// —— Tier1 采集器编排：ESPN → NBA 官网 → Shams（每个之间礼貌延时 3s）——
export async function runTier1(): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  results.push(await runEspn());
  await politeDelay(3000);
  results.push(await runNba());
  await politeDelay(3000);
  results.push(await runShams());
  return results;
}

// —— 入库管道：去重 → 球员识别 → 规则分类 → 落库 ——
export async function ingest(results: SourceResult[]) {
  const db = getDb();
  const refs = await loadPlayerRefs();
  const tierByKey: Record<string, number> = { espn: 1, nba: 1, shams: 1, hupu: 2, zhibo8: 2, tencent: 2 };
  const nameByKey: Record<string, string> = {
    espn: "ESPN", nba: "CBS Sports", shams: "Shams Charania",
    hupu: "Hupu", zhibo8: "Zhibo8", tencent: "Tencent Sports",
  };

  let inserted = 0;
  let skippedDup = 0;
  let skippedNoPlayer = 0;
  let skippedUnclassified = 0;

  for (const res of results) {
    for (const art of res.articles) {
      const text = `${art.title} ${art.snippet ?? ""}`;
      const matches = matchPlayers(refs, text);
      if (matches.length === 0) {
        skippedNoPlayer++;
        continue;
      }
      const cls = classifyArticle(text);
      if (!cls) {
        skippedUnclassified++;
        continue;
      }
      const confirmed = !isRumor(text);
      // 只写主角（命中最多者）；共同主角的新闻 Phase B 用事件聚类归并
      const playerId = matches[0].playerId;
      // 去重键不含信源：同一篇通稿被 ESPN/Shams 等多源转载时只收一次
      const key = dedupKey(art.title, art.url);
      try {
        const [{ id: newsId }] = await db.insert(newsItems).values({
          playerId,
          date: art.publishedAt.toISOString().slice(0, 10),
          title: art.title.slice(0, 490),
          url: art.url.slice(0, 990),
          content: (art.snippet ?? "").slice(0, 2000),
          source: nameByKey[res.sourceKey] ?? res.sourceKey,
          sourceTier: tierByKey[res.sourceKey] ?? 3,
          category: cls.category,
          sentiment: cls.sentiment,
          confirmed,
          severity: cls.severity,
          classifier: cls.classifier,
          dedupKey: key,
        }).$returningId();
        // Phase B：事件聚类（向量相似度归并同事件多源转载）
        await assignEvent(newsId);
        inserted++;
      } catch (e) {
        // 唯一键冲突 = 重复新闻，正常跳过（DrizzleQueryError 的真实原因在 cause 里）
        const cause = e instanceof Error && e.cause ? String(e.cause) : "";
        const msg = `${String(e)} ${cause}`;
        if (/duplicate/i.test(msg)) skippedDup++;
        else throw e;
      }
    }
  }
  return { inserted, skippedDup, skippedNoPlayer, skippedUnclassified };
}

// —— 每日情绪聚合（7 日窗口 + 半衰期 2 天衰减，v2.1 规则）——
export async function recomputeSentiment(today = new Date()) {
  const db = getDb();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - NEWS_WINDOW_DAYS);
  const startStr = windowStart.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const allPlayers = await db.select({ id: players.id }).from(players);
  for (const p of allPlayers) {
    const rows = await db
      .select({
        date: newsItems.date,
        sentiment: newsItems.sentiment,
        confirmed: newsItems.confirmed,
        sourceTier: newsItems.sourceTier,
        category: newsItems.category,
        eventId: newsItems.eventId,
      })
      .from(newsItems)
      .where(and(eq(newsItems.playerId, p.id), gte(newsItems.date, startStr)));

    // Phase B：事件级聚合——同一事件的多源转载只计权重最高的一条，避免重复计权
    const byEvent = new Map<string, { score: number; w: number }>();
    let bullish = 0;
    let bearish = 0;
    for (const r of rows) {
      const daysAgo = Math.max(0, Math.round((today.getTime() - new Date(r.date).getTime()) / 86400000));
      const w = sentimentWeight(r.sourceTier, r.confirmed, daysAgo);
      const key = r.eventId ? `ev:${r.eventId}` : `raw:${r.date}:${r.category}:${r.sentiment > 0 ? "up" : "down"}`;
      const score = r.sentiment * w;
      const cur = byEvent.get(key);
      if (!cur || Math.abs(score) > Math.abs(cur.score)) byEvent.set(key, { score, w });
      if (r.sentiment > 0) bullish++;
      else if (r.sentiment < 0) bearish++;
    }
    let net = 0;
    for (const { score } of byEvent.values()) net += score;
    const netScaled = +(net * 100).toFixed(1); // 放大到 ±100 区间（与前端展示一致）
    const hasNews = rows.length > 0;

    await db
      .insert(sentimentDaily)
      .values({
        playerId: p.id,
        date: todayStr,
        netSentiment: netScaled,
        bullishCount: bullish,
        bearishCount: bearish,
        windowEnd: todayStr,
      })
      .onDuplicateKeyUpdate({ set: { netSentiment: netScaled, bullishCount: bullish, bearishCount: bearish } });

    await db
      .update(players)
      .set({
        sentiment7d: netScaled,
        netSentiment: netScaled,
        hasRecentNews: hasNews,
        // v2.1：无新闻 → 情绪维度中性，指数不动
        scoreSentiment: hasNews ? Math.round(Math.max(0, Math.min(100, 50 + netScaled / 2))) : 50,
      })
      .where(eq(players.id, p.id));
  }
  return allPlayers.length;
}

// —— 存量重分类：用当前分类器（M1）重判所有新闻，再重聚类、重算情绪 ——
export async function reclassifyAll() {
  const db = getDb();
  const rows = await db.select().from(newsItems);
  let updated = 0;
  for (const r of rows) {
    const text = `${r.title} ${r.content ?? ""}`;
    const cls = classifyArticle(text);
    if (!cls) continue;
    if (cls.category !== r.category || cls.sentiment !== r.sentiment) {
      await db
        .update(newsItems)
        .set({
          category: cls.category,
          sentiment: cls.sentiment,
          severity: cls.severity,
          classifier: cls.classifier,
          confirmed: !isRumor(text),
          eventId: null, // 清掉旧聚类，稍后按新分类重聚
        })
        .where(eq(newsItems.id, r.id));
      updated++;
    }
  }
  // 重建事件聚类（先清表，再全量分配）
  await db.update(newsItems).set({ eventId: null });
  await db.delete(newsEvents);
  const clustered = await clusterAllUnassigned();
  const players_ = await recomputeSentiment();
  return { total: rows.length, reclassified: updated, clustered, playersRecomputed: players_ };
}

// —— 启动补跑：进程重启后检查各环节是否过期，过期则立即补跑，保证每天必更新 ——
async function catchUpOnBoot() {
  const db = getDb();
  const now = Date.now();
  const HOUR = 3_600_000;
  try {
    const health = await db.select().from(sourceHealth);
    const byKey = new Map(health.map((h) => [h.sourceKey, h]));
    const lastRun = (k: string) => byKey.get(k)?.lastRunAt?.getTime() ?? 0;

    // Tier1/Tier2：超过阈值未跑则补
    const tier1Stale = ["espn", "nba", "shams"].some((k) => now - lastRun(k) > HOUR);
    if (tier1Stale) {
      console.log("[pipeline] boot catch-up: Tier1 collect");
      const stats = await ingest(await runTier1());
      console.log("[pipeline] boot Tier1 ingest", stats);
    }
    const tier2Stale = ["hupu", "zhibo8"].some((k) => now - lastRun(k) > 12 * HOUR);
    if (tier2Stale) {
      console.log("[pipeline] boot catch-up: Tier2 collect");
      const stats = await ingest(await runTier2());
      console.log("[pipeline] boot Tier2 ingest", stats);
    }
    // 赛季数据：超过 24h 未同步则补
    if (now - lastRun("espn-stats") > 24 * HOUR) {
      console.log("[pipeline] boot catch-up: season stats sync");
      await syncSeasonStats().catch((e) => console.error("[pipeline] stats sync failed", e));
    }
    // 情绪+指数：今天没跑过则补（看 sentiment_daily 最新日期）
    const rows = await db
      .select({ d: sentimentDaily.date })
      .from(sentimentDaily)
      .orderBy(desc(sentimentDaily.date))
      .limit(1);
    const today = new Date().toISOString().slice(0, 10);
    if (!rows[0] || rows[0].d < today) {
      console.log("[pipeline] boot catch-up: sentiment + M0 engine");
      await recomputeSentiment();
      const engine = await runDailyEngine();
      console.log("[pipeline] boot M0 daily engine", engine);
    }
  } catch (e) {
    console.error("[pipeline] boot catch-up failed", e);
  }
}

// —— 定时任务：Tier1 每小时整点后 5 分钟运行；情绪聚合+M0 引擎每日 08:00；锚定校准每周日 09:00 ——
export function startScheduler() {
  // 启动后 15 秒做补跑检查（等 DB 连接就绪，且不阻塞服务启动）
  setTimeout(() => void catchUpOnBoot(), 15_000);
  cron.schedule("5 * * * *", async () => {
    console.log("[pipeline] hourly Tier1 collect", new Date().toISOString());
    const results = await runTier1();
    const stats = await ingest(results);
    console.log("[pipeline] ingest", stats);
  });
  cron.schedule("20 7,19 * * *", async () => {
    // Tier2 中文信源：每日 07:20 / 19:20 两次（低频只读）
    console.log("[pipeline] Tier2 collect", new Date().toISOString());
    const results = await runTier2();
    const stats = await ingest(results);
    console.log("[pipeline] Tier2 ingest", stats);
  });
  cron.schedule("30 7 * * *", async () => {
    // 每日 07:30 同步真实赛况数据（ESPN），先于 08:00 的情绪/指数流水线
    try {
      const r = await syncSeasonStats();
      console.log("[pipeline] daily season stats sync", r);
    } catch (e) {
      console.error("[pipeline] season stats sync failed", e);
    }
  });
  cron.schedule("0 8 * * *", async () => {
    const n = await recomputeSentiment();
    console.log(`[pipeline] daily sentiment recompute for ${n} players`);
    const engine = await runDailyEngine();
    console.log("[pipeline] M0 daily engine", engine);
  });
  cron.schedule("0 9 * * 0", async () => {
    const cal = await runAnchorCalibration();
    console.log("[pipeline] weekly anchor calibration", cal);
  });
  console.log(
    "[pipeline] scheduler started (Tier1 hourly, sentiment+M0 daily 08:00, anchor calibration Sun 09:00)",
  );
}

// CLI：npx tsx api/collectors/run.ts
if (process.argv[1]?.endsWith("run.ts")) {
  (async () => {
    console.log("[pipeline] manual Tier1 run");
    const results = await runTier1();
    for (const r of results) console.log(`  ${r.sourceKey}: ${r.articles.length} articles${r.error ? ` (error: ${r.error})` : ""}`);
    const stats = await ingest(results);
    console.log("[pipeline] ingest:", stats);
    const n = await recomputeSentiment();
    console.log(`[pipeline] sentiment recomputed for ${n} players`);
    const engine = await runDailyEngine();
    console.log("[pipeline] M0 daily engine:", engine);
    process.exit(0);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
