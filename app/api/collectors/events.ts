import { getDb } from "../queries/connection";
import { newsEvents, newsItems } from "@db/schema";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { cosine, embedText, embeddingAvailable } from "./embed";

// 事件聚类：把同一事件的多源转载归并到 news_events（含中英文对照去重）。
// 主路径：bge-m3 向量余弦相似度（中英跨语言有效）；
// 降级路径：标题词集合 Jaccard 相似度（无向量服务时）。
// 判定窗口：同球员 ±4 天内的事件。
// 阈值（实测标定 2026-09）：向量 ≥0.55（同事件实测 0.63-0.72，无关 0.32-0.48）；
// 同语种 Jaccard ≥0.45；跨语种（一中一英）Jaccard 恒为 0，用实体重叠 ≥0.5 兜底。

const EVENT_WINDOW_DAYS = 4;
const COS_THRESHOLD = 0.72; // 实测标定：同事件 0.72-0.74，同球员不同事件最高 0.70
const JACCARD_THRESHOLD = 0.45;
const ENTITY_OVERLAP_THRESHOLD = 0.5;
// 跨语种（一中一英）向量相似度系统性偏低（实测同一事件仅 0.54-0.72），
// 需叠加条件：分类一致 + 实体有重叠（数字/英文名），否则同球员热点话题会互相误并
const COS_THRESHOLD_CROSS = 0.52;

const hasCjk = (s: string) => /[一-鿿]/.test(s);

/** 提取标题中的命名实体（英文大写词 / 数字 / 中文连续段），用于跨语种兜底 */
function entities(title: string): Set<string> {
  const out = new Set<string>();
  for (const m of title.matchAll(/[A-Z][a-zA-Z]+|\d+(?:\.\d+)?/g)) out.add(m[0].toLowerCase());
  for (const m of title.matchAll(/[一-鿿]{2,}/g)) out.add(m[0]);
  return out;
}

function entityOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/** 为一条新闻找/建事件，返回 eventId */
export async function assignEvent(newsId: number): Promise<number | null> {
  const db = getDb();
  const item = await db.query.newsItems.findFirst({ where: eq(newsItems.id, newsId) });
  if (!item) return null;
  if (item.eventId) return item.eventId;

  // 计算本条的向量（只嵌入标题：摘要常含来源/模板噪音，会稀释相似度）
  let vec: number[] | null = null;
  if (embeddingAvailable()) {
    vec = await embedText(item.title);
    if (vec) {
      await db.update(newsItems).set({ embedding: JSON.stringify(vec) }).where(eq(newsItems.id, newsId));
    }
  }

  // 候选事件：同球员、近 4 天内
  const since = new Date(item.date);
  since.setDate(since.getDate() - EVENT_WINDOW_DAYS);
  const candidates = await db
    .select()
    .from(newsEvents)
    .where(and(eq(newsEvents.playerId, item.playerId), gte(newsEvents.firstSeenAt, since)))
    .orderBy(desc(newsEvents.firstSeenAt));

  let bestEvent: { id: number; sim: number } | null = null;
  for (const ev of candidates) {
    // 事件代表文本：取该事件第一条带向量的新闻
    const rep = await db.query.newsItems.findFirst({
      where: and(eq(newsItems.eventId, ev.id), isNotNull(newsItems.embedding)),
      orderBy: newsItems.id,
    });
    let sim = 0;
    if (vec && rep?.embedding) {
      sim = cosine(vec, JSON.parse(rep.embedding) as number[]);
      const crossLingual = hasCjk(item.title) !== hasCjk(ev.title);
      if (crossLingual) {
        // 跨语种：更高相似度直通；中间区间要求分类一致 + 实体重叠
        const entOverlap = entityOverlap(entities(item.title), entities(ev.title));
        const evCategory = rep?.category ?? null;
        const sameCategory = evCategory !== null && item.category === evCategory;
        const pass =
          sim >= COS_THRESHOLD ||
          (sim >= COS_THRESHOLD_CROSS && sameCategory && entOverlap > 0);
        if (!pass) continue;
      } else if (sim < COS_THRESHOLD) continue;
    } else {
      // 降级：与事件标题做 Jaccard；跨语种（一中一英）词集无交集，改用实体重叠
      const crossLingual = hasCjk(item.title) !== hasCjk(ev.title);
      sim = crossLingual
        ? entityOverlap(entities(item.title), entities(ev.title))
        : jaccard(tokenize(item.title), tokenize(ev.title));
      const threshold = crossLingual ? ENTITY_OVERLAP_THRESHOLD : JACCARD_THRESHOLD;
      if (sim < threshold) continue;
    }
    if (!bestEvent || sim > bestEvent.sim) bestEvent = { id: ev.id, sim };
  }

  let eventId: number;
  if (bestEvent) {
    eventId = bestEvent.id;
    // 更新事件聚合信息：更权威的信源、更强的情绪
    const ev = candidates.find((c) => c.id === eventId)!;
    const betterTier = Math.min(ev.bestSourceTier, item.sourceTier);
    const betterSent =
      Math.abs(item.sentiment) * (item.sourceTier === 1 ? 1 : 0.6) >
      Math.abs(ev.bestSentiment) * (ev.bestSourceTier === 1 ? 1 : 0.6)
        ? item.sentiment
        : ev.bestSentiment;
    await db
      .update(newsEvents)
      .set({ itemCount: ev.itemCount + 1, bestSourceTier: betterTier, bestSentiment: betterSent })
      .where(eq(newsEvents.id, eventId));
  } else {
    const [{ id }] = await db
      .insert(newsEvents)
      .values({
        playerId: item.playerId,
        title: item.title.slice(0, 490),
        firstSeenAt: new Date(item.date),
        bestSourceTier: item.sourceTier,
        bestSentiment: item.sentiment,
        itemCount: 1,
      })
      .$returningId();
    eventId = id;
  }

  await db.update(newsItems).set({ eventId }).where(eq(newsItems.id, newsId));
  return eventId;
}

/** 对全量未聚类的新闻批量执行（重跑/补跑） */
export async function clusterAllUnassigned(): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: newsItems.id }).from(newsItems);
  let done = 0;
  for (const r of rows) {
    await assignEvent(r.id);
    done++;
  }
  return done;
}
