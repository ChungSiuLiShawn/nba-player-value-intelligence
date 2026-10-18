/**
 * Phase D — M0 rule-based index engine.
 *
 * Daily jobs (run after recomputeSentiment):
 *  1. runIndexDaily()      — evolve value_index from net sentiment, append index_history
 *  2. snapshotPredictions()— write today's 7-day forecast per player (predictions table)
 *  3. backfillPredictions()— fill actual_index_7d + hit for predictions aged ≥ 7 days
 *  4. runAnchorCalibration()— Pearson correlation of PVI vs anchors (2K rating), quarterly record
 *
 * v2.1 rule preserved: no news in the 7-day window → index untouched that day.
 */
import { getDb } from "../queries/connection";
import {
  anchorCalibrations,
  indexHistory,
  newsEvents,
  players,
  predictions,
} from "@db/schema";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";

// —— 参数（M0 经验值，积累 60–90 天特征快照后由模型取代）——
const SENTI_TO_INDEX = 0.03; // 情绪 ±100 → 指数日变动 ±3
const MAX_DAILY_DELTA = 4; // 单日涨跌幅上限
const PREDICTION_WINDOW_DAYS = 7;

const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
const daysAgoStr = (n: number, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// —— 1. 指数日度演化 ——
export async function runIndexDaily(today = new Date()) {
  const db = getDb();
  const dateStr = todayStr(today);
  const all = await db
    .select({
      id: players.id,
      valueIndex: players.valueIndex,
      change7d: players.change7d,
      change30d: players.change30d,
      sentiment7d: players.sentiment7d,
      hasRecentNews: players.hasRecentNews,
    })
    .from(players);

  let moved = 0;
  for (const p of all) {
    // 幂等：基准取 history 中 today 之前的最后一个值，而非 value_index 现值
    // —— 同一天重跑不会重复叠加 delta
    const [prev] = await db
      .select({ value: indexHistory.value })
      .from(indexHistory)
      .where(and(eq(indexHistory.playerId, p.id), lte(indexHistory.date, daysAgoStr(1, today))))
      .orderBy(desc(indexHistory.date))
      .limit(1);
    const baseValue = prev?.value ?? p.valueIndex;

    // v2.1：无新闻 → 指数不动，但仍落一条持平快照，保证时序连续
    const rawDelta = p.hasRecentNews ? p.sentiment7d * SENTI_TO_INDEX : 0;
    const delta = +clamp(rawDelta, -MAX_DAILY_DELTA, MAX_DAILY_DELTA).toFixed(2);
    const newValue = +clamp(baseValue + delta, 0, 100).toFixed(1);

    // 事件标注：当天变动显著时，取该球员当日权重最高的事件标题
    let event: string | null = null;
    if (Math.abs(delta) >= 0.5) {
      const [ev] = await db
        .select({ title: newsEvents.title })
        .from(newsEvents)
        .where(eq(newsEvents.playerId, p.id))
        .orderBy(desc(newsEvents.firstSeenAt))
        .limit(1);
      event = ev?.title.slice(0, 250) ?? null;
    }

    await db
      .insert(indexHistory)
      .values({ playerId: p.id, date: dateStr, value: newValue, event })
      .onDuplicateKeyUpdate({ set: { value: newValue, event } });

    // 重算 7/30 天涨跌（基于 index_history）
    const histRows = await db
      .select({ date: indexHistory.date, value: indexHistory.value })
      .from(indexHistory)
      .where(
        and(eq(indexHistory.playerId, p.id), gte(indexHistory.date, daysAgoStr(31, today))),
      )
      .orderBy(indexHistory.date);
    const ref7 = histRows.filter((r) => r.date <= daysAgoStr(7, today)).pop();
    const ref30 = histRows[0];
    // 窗口内没有参考点（引擎上线初期 history 断档）→ 保留原有值，不归零
    const change7d = ref7 ? +(newValue - ref7.value).toFixed(1) : p.change7d;
    const change30d = ref30 ? +(newValue - ref30.value).toFixed(1) : p.change30d;

    await db
      .update(players)
      .set({ valueIndex: newValue, change7d, change30d })
      .where(eq(players.id, p.id));
    if (delta !== 0) moved++;
  }
  return { players: all.length, moved, date: dateStr };
}

// —— M0 预测规则：情绪漂移 + 动能延续 + 基本面锚定（2K 评分 + 身体基本盘）——
export function m0Forecast(p: {
  valueIndex: number;
  sentiment7d: number;
  change7d: number;
  overallRating: number;
  scorePhysical: number;
}) {
  const sentimentDrift = clamp(p.sentiment7d * 0.15, -6, 6); // 7 日情绪漂移
  const momentum = clamp(p.change7d * 0.35, -3.5, 3.5); // 新闻情绪动量延续（占比 35%）
  // 锚 = 2K 能力值（55%）+ 身体基本盘（20%）：身高臂展弹跳力量是价值的硬约束
  const anchor = 25 + p.overallRating * 0.55 + p.scorePhysical * 0.2;
  const anchorPull = clamp((anchor - p.valueIndex) * 0.05, -1.5, 1.5); // 弱均值回归
  const predicted = +clamp(p.valueIndex + sentimentDrift + momentum + anchorPull, 0, 100).toFixed(1);
  const riseProbability = Math.round(
    clamp(50 + p.sentiment7d * 0.6 + p.change7d * 2, 5, 95),
  );
  return { predicted, riseProbability };
}

// —— 2. 每日预测快照 ——
export async function snapshotPredictions(today = new Date()) {
  const db = getDb();
  const dateStr = todayStr(today);
  const all = await db
    .select({
      id: players.id,
      valueIndex: players.valueIndex,
      sentiment7d: players.sentiment7d,
      change7d: players.change7d,
      overallRating: players.overallRating,
      scorePhysical: players.scorePhysical,
    })
    .from(players);

  let written = 0;
  for (const p of all) {
    const { predicted, riseProbability } = m0Forecast({
      ...p,
      scorePhysical: p.scorePhysical ?? 50,
    });
    await db
      .insert(predictions)
      .values({
        playerId: p.id,
        predictDate: dateStr,
        predictedIndex7d: predicted,
        riseProbability,
        modelVersion: "M0",
      })
      .onDuplicateKeyUpdate({
        set: { predictedIndex7d: predicted, riseProbability },
      });
    await db
      .update(players)
      .set({ predictedIndex7d: predicted, riseProbability })
      .where(eq(players.id, p.id));
    written++;
  }
  return { written, date: dateStr };
}

// —— 3. 预测回填：满 7 天的预测写入实际值并判定方向命中 ——
export async function backfillPredictions(today = new Date()) {
  const db = getDb();
  const due = await db
    .select()
    .from(predictions)
    .where(
      and(isNull(predictions.actualIndex7d), lte(predictions.predictDate, daysAgoStr(PREDICTION_WINDOW_DAYS, today))),
    );

  let filled = 0;
  for (const pred of due) {
    const targetDate = daysAgoStr(-PREDICTION_WINDOW_DAYS, new Date(pred.predictDate)); // predict_date + 7
    // 基准值：预测日当天的指数（history 里 ≤ 预测日的最后一条）
    const baseRows = await db
      .select({ date: indexHistory.date, value: indexHistory.value })
      .from(indexHistory)
      .where(and(eq(indexHistory.playerId, pred.playerId), lte(indexHistory.date, pred.predictDate)))
      .orderBy(desc(indexHistory.date))
      .limit(1);
    const actualRows = await db
      .select({ date: indexHistory.date, value: indexHistory.value })
      .from(indexHistory)
      .where(and(eq(indexHistory.playerId, pred.playerId), lte(indexHistory.date, targetDate)))
      .orderBy(desc(indexHistory.date))
      .limit(1);
    const base = baseRows[0]?.value;
    const actual = actualRows[0]?.value;
    if (base == null || actual == null) continue;

    const predDelta = pred.predictedIndex7d - base;
    const actDelta = actual - base;
    const flat = (v: number) => Math.abs(v) < 0.5;
    const hit = flat(predDelta) && flat(actDelta) ? true : predDelta * actDelta > 0;

    await db
      .update(predictions)
      .set({ actualIndex7d: actual, hit })
      .where(eq(predictions.id, pred.id));
    filled++;
  }
  return { due: due.length, filled };
}

// —— 4. 锚定校准：PVI 与 2K 评分的 Pearson 相关（季度记录）——
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx * dy === 0 ? 0 : +(num / Math.sqrt(dx * dy)).toFixed(3);
}

export async function runAnchorCalibration(note?: string) {
  const db = getDb();
  const all = await db
    .select({ valueIndex: players.valueIndex, overallRating: players.overallRating })
    .from(players);
  const corr = pearson(
    all.map((p) => p.valueIndex),
    all.map((p) => p.overallRating),
  );
  const now = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  await db.insert(anchorCalibrations).values({
    anchorType: "2k_rating",
    quarter,
    correlation: corr,
    note:
      note ??
      `M0 auto-calibration: Pearson r between PVI and 2K OVR across ${all.length} players.`,
  });
  return { quarter, correlation: corr, sample: all.length };
}

// —— 组合：每日引擎（情绪聚合之后调用）——
export async function runDailyEngine(today = new Date()) {
  const index = await runIndexDaily(today);
  const snap = await snapshotPredictions(today);
  const back = await backfillPredictions(today);
  return { index, snap, back };
}
