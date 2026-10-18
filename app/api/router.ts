import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  boardPlayers,
  findPlayerBySlug,
  findPlayers,
  gmScLeaders,
  listSourceHealth,
  playerCount,
  recentNews,
  sentimentSnapshots,
} from "./queries/players";
import { runTier1, ingest, recomputeSentiment, reclassifyAll } from "./collectors/run";
import { syncSeasonStats } from "./collectors/stats";
import { runTier2 } from "./collectors/tier2";
import {
  backfillPredictions,
  runAnchorCalibration,
  runDailyEngine,
  snapshotPredictions,
} from "./engine/m0";
import { anchorCalibrations, predictions } from "@db/schema";
import { desc, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./queries/connection";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  players: createRouter({
    list: publicQuery.input(z.object({ q: z.string().optional() }).optional()).query(({ input }) =>
      findPlayers(input?.q)
    ),
    detail: publicQuery.input(z.object({ slug: z.string() })).query(({ input }) =>
      findPlayerBySlug(input.slug)
    ),
    board: publicQuery
      .input(
        z.object({
          kind: z.enum(["gainers", "losers", "sentiment", "bearish", "prediction"]),
          limit: z.number().min(1).max(250).default(10),
        })
      )
      .query(({ input }) => boardPlayers(input.kind, input.limit)),
    count: publicQuery.query(() => playerCount()),
  }),

  news: createRouter({
    recent: publicQuery.input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional()).query(
      ({ input }) => recentNews(input?.limit ?? 20)
    ),
  }),

  stats: createRouter({
    leaders: publicQuery.query(() => gmScLeaders()),
  }),

  admin: createRouter({
    sourceHealth: publicQuery.query(() => listSourceHealth()),
    sentimentSnapshots: publicQuery.query(() => sentimentSnapshots()),
    // 手动触发采集管道（原型阶段公开；上线前需加管理鉴权）
    runCollectors: publicQuery.mutation(async () => {
      const results = await runTier1();
      const stats = await ingest(results);
      return {
        sources: results.map((r) => ({ key: r.sourceKey, fetched: r.articles.length, error: r.error ?? null })),
        ingest: stats,
      };
    }),
    recomputeSentiment: publicQuery.mutation(() => recomputeSentiment()),
    // 真实赛况数据同步（ESPN core API）
    syncSeasonStats: publicQuery.mutation(() => syncSeasonStats()),
    // Tier2 中文信源采集（直播吧 + 虎扑）
    runTier2: publicQuery.mutation(async () => {
      const results = await runTier2();
      const stats = await ingest(results);
      return {
        sources: results.map((r) => ({ key: r.sourceKey, fetched: r.articles.length, error: r.error ?? null })),
        ingest: stats,
      };
    }),
    // 存量重分类 + 事件重聚类（Phase B：M1 语境分类器 + 向量聚类）
    reclassifyAll: publicQuery.mutation(() => reclassifyAll()),
    // Phase D：M0 日度引擎（指数演化 + 预测快照 + 回填）
    runDailyEngine: publicQuery.mutation(async () => {
      await recomputeSentiment();
      return runDailyEngine();
    }),
    snapshotPredictions: publicQuery.mutation(() => snapshotPredictions()),
    backfillPredictions: publicQuery.mutation(() => backfillPredictions()),
    // 预测准确率（已满 7 天并回填的样本）
    predictionAccuracy: publicQuery.query(async () => {
      const db = getDb();
      const [agg] = await db
        .select({
          total: sql<number>`count(*)`,
          resolved: sql<number>`sum(case when hit is not null then 1 else 0 end)`,
          hits: sql<number>`sum(case when hit = 1 then 1 else 0 end)`,
        })
        .from(predictions);
      const total = Number(agg?.total ?? 0);
      const resolved = Number(agg?.resolved ?? 0);
      const hits = Number(agg?.hits ?? 0);
      return {
        total,
        resolved,
        hits,
        accuracy: resolved > 0 ? +((hits / resolved) * 100).toFixed(1) : null,
      };
    }),
    // 锚定校准：季度记录查询 + 手动触发
    anchorCalibrations: publicQuery.query(async () => {
      const db = getDb();
      return db
        .select()
        .from(anchorCalibrations)
        .orderBy(desc(anchorCalibrations.createdAt))
        .limit(12);
    }),
    runAnchorCalibration: publicQuery.mutation(() => runAnchorCalibration()),
    // 最近的预测样本（回填看板）
    recentPredictions: publicQuery.query(async () => {
      const db = getDb();
      return db
        .select()
        .from(predictions)
        .where(isNotNull(predictions.hit))
        .orderBy(desc(predictions.predictDate))
        .limit(20);
    }),
  }),
});

export type AppRouter = typeof appRouter;
