import { getDb } from "./connection";
import { players, indexHistory, newsItems, sentimentDaily, sourceHealth } from "@db/schema";
import { and, desc, eq, gte, like, or, sql } from "drizzle-orm";
import { NEWS_WINDOW_DAYS } from "@contracts/sentiment";

// —— 通用行映射：DB 行 → 前端 Player 形状 ——
export function toPlayerDto(r: typeof players.$inferSelect) {
  return {
    id: r.slug,
    nameZh: r.nameZh,
    nameEn: r.nameEn,
    position: r.position,
    team: r.team,
    age: r.age,
    overallRating: r.overallRating,
    avatarColor: r.avatarColor,
    valueIndex: r.valueIndex,
    change7d: r.change7d,
    change30d: r.change30d,
    predictedIndex7d: r.predictedIndex7d,
    riseProbability: r.riseProbability,
    netSentiment: r.netSentiment,
    sentiment7d: r.sentiment7d,
    hasRecentNews: r.hasRecentNews,
    scores: {
      performance: r.scorePerformance,
      role: r.scoreRole,
      sentiment: r.scoreSentiment,
      contract: r.scoreContract,
      age: r.scoreAge,
      commercial: r.scoreCommercial,
      physical: r.scorePhysical,
    },
    physical: {
      heightIn: r.heightIn,
      weightLbs: r.weightLbs,
      wingspanIn: r.wingspanIn,
      verticalIn: r.verticalIn,
      strengthScore: r.strengthScore,
    },
    espnId: r.espnId,
    predictionReasons: JSON.parse(r.predictionReasons) as string[],
    reportSummary: r.reportSummary,
    reportFactors: JSON.parse(r.reportFactors) as { name: string; change: string; direction: "up" | "down" | "flat"; contribution: number }[],
    reportVerdict: r.reportVerdict,
    stats: {
      gp: r.gp, min: r.min, pts: r.pts, ast: r.ast, oreb: r.oreb, dreb: r.dreb,
      stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf, fgm: r.fgm, fga: r.fga,
      p3m: r.p3m, p3a: r.p3a, ftm: r.ftm, fta: r.fta, tsPct: r.tsPct, gmSc: r.gmSc,
    },
  };
}

export async function findPlayers(q?: string) {
  const db = getDb();
  const rows = q
    ? await db
        .select()
        .from(players)
        .where(or(like(players.nameZh, `%${q}%`), like(players.nameEn, `%${q}%`), like(players.team, `%${q}%`)))
        .limit(20)
    : await db.select().from(players);
  return rows.map(toPlayerDto);
}

export async function findPlayerBySlug(slug: string) {
  const db = getDb();
  const r = await db.query.players.findFirst({ where: eq(players.slug, slug) });
  if (!r) return null;
  const dto = toPlayerDto(r);

  const hist = await db
    .select({ date: indexHistory.date, value: indexHistory.value, event: indexHistory.event })
    .from(indexHistory)
    .where(eq(indexHistory.playerId, r.id))
    .orderBy(indexHistory.date);

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - NEWS_WINDOW_DAYS);
  const news = await db
    .select()
    .from(newsItems)
    .where(and(eq(newsItems.playerId, r.id), gte(newsItems.date, windowStart.toISOString().slice(0, 10))))
    .orderBy(desc(newsItems.date));

  return {
    ...dto,
    history: hist.map((h) => ({ date: h.date, value: h.value, event: h.event ?? undefined })),
    news: news.map((n) => ({
      id: String(n.id),
      date: n.date,
      title: n.title,
      url: n.url,
      source: n.source,
      sourceTier: n.sourceTier,
      category: n.category,
      sentiment: n.sentiment,
      confirmed: n.confirmed,
    })),
  };
}

export async function boardPlayers(kind: "gainers" | "losers" | "sentiment" | "bearish" | "prediction", limit = 10) {
  const db = getDb();
  const rows = await db.select().from(players);
  let list = rows;
  if (kind === "sentiment" || kind === "prediction") list = rows.filter((r) => r.hasRecentNews);
  const sorted = [...list].sort((a, b) => {
    switch (kind) {
      case "gainers": return b.change7d - a.change7d;
      case "losers": return a.change7d - b.change7d;
      case "sentiment": return b.sentiment7d - a.sentiment7d;
      case "bearish": return a.sentiment7d - b.sentiment7d;
      case "prediction": return b.riseProbability - a.riseProbability;
    }
  });
  return sorted.slice(0, limit).map(toPlayerDto);
}

export async function recentNews(limit = 20) {
  const db = getDb();
  const rows = await db
    .select({ item: newsItems, player: players })
    .from(newsItems)
    .innerJoin(players, eq(newsItems.playerId, players.id))
    .orderBy(desc(newsItems.date), desc(newsItems.id))
    .limit(limit);
  return rows.map(({ item, player }) => ({
    id: String(item.id),
    date: item.date,
    title: item.title,
    url: item.url,
    source: item.source,
    sourceTier: item.sourceTier,
    category: item.category,
    sentiment: item.sentiment,
    confirmed: item.confirmed,
    player: toPlayerDto(player),
  }));
}

export async function gmScLeaders() {
  const rows = await getDb().select().from(players);
  const val = (p: typeof players.$inferSelect, key: string) =>
    key === "reb" ? p.oreb + p.dreb : (p as unknown as Record<string, number>)[key];
  return (["pts", "ast", "reb", "stl"] as const).map((key) => {
    const top = [...rows].sort((a, b) => val(b, key) - val(a, key))[0];
    return { key, player: toPlayerDto(top), value: val(top, key) };
  });
}

export async function listSourceHealth() {
  return getDb().select().from(sourceHealth);
}

export async function sentimentSnapshots(limit = 500) {
  const db = getDb();
  return db
    .select()
    .from(sentimentDaily)
    .orderBy(desc(sentimentDaily.date))
    .limit(limit);
}

export async function playerCount() {
  const db = getDb();
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(players);
  return r.n;
}
