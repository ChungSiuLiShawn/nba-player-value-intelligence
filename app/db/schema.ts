import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  double,
  boolean,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// —— 球员主表 ——
export const players = mysqlTable(
  "players",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    nameZh: varchar("name_zh", { length: 100 }).notNull(),
    nameEn: varchar("name_en", { length: 100 }).notNull(),
    position: varchar("position", { length: 4 }).notNull(),
    team: varchar("team", { length: 20 }).notNull(),
    age: int("age").notNull(),
    overallRating: int("overall_rating").notNull(),
    avatarColor: varchar("avatar_color", { length: 10 }).notNull(),
    // 赛季基础数据轨（15 项场均计数 + 派生效率指标，Phase A 由种子数据初始化）
    gp: int("gp").notNull().default(0),
    min: double("min").notNull().default(0),
    pts: double("pts").notNull().default(0),
    ast: double("ast").notNull().default(0),
    oreb: double("oreb").notNull().default(0),
    dreb: double("dreb").notNull().default(0),
    stl: double("stl").notNull().default(0),
    blk: double("blk").notNull().default(0),
    tov: double("tov").notNull().default(0),
    pf: double("pf").notNull().default(0),
    fgm: double("fgm").notNull().default(0),
    fga: double("fga").notNull().default(0),
    p3m: double("p3m").notNull().default(0),
    p3a: double("p3a").notNull().default(0),
    ftm: double("ftm").notNull().default(0),
    fta: double("fta").notNull().default(0),
    tsPct: double("ts_pct").notNull().default(0),
    gmSc: double("gm_sc").notNull().default(0),
    // 指数与预测（M0 规则引擎产出）
    valueIndex: double("value_index").notNull(),
    change7d: double("change_7d").notNull().default(0),
    change30d: double("change_30d").notNull().default(0),
    predictedIndex7d: double("predicted_index_7d").notNull().default(0),
    riseProbability: int("rise_probability").notNull().default(50),
    // 情绪与六维
    netSentiment: double("net_sentiment").notNull().default(0),
    sentiment7d: double("sentiment_7d").notNull().default(0),
    hasRecentNews: boolean("has_recent_news").notNull().default(false),
    scorePerformance: int("score_performance").notNull().default(50),
    scoreRole: int("score_role").notNull().default(50),
    scoreSentiment: int("score_sentiment").notNull().default(50),
    scoreContract: int("score_contract").notNull().default(50),
    scoreAge: int("score_age").notNull().default(50),
    scoreCommercial: int("score_commercial").notNull().default(50),
    // 物理基本盘（ESPN 身高体重 + 位置规范推算臂展/弹跳/力量）
    heightIn: double("height_in").notNull().default(0), // 身高（英寸）
    weightLbs: double("weight_lbs").notNull().default(0), // 体重（磅）
    wingspanIn: double("wingspan_in").notNull().default(0), // 臂展（英寸，推算）
    verticalIn: double("vertical_in").notNull().default(0), // 弹跳（英寸，推算）
    strengthScore: int("strength_score").notNull().default(50), // 力量分（推算）
    scorePhysical: int("score_physical").notNull().default(50), // 物理基本盘维度分
    espnId: varchar("espn_id", { length: 20 }), // ESPN 运动员 id（头像 URL 用）
    // 归因报告（M0 模板生成，后续 LLM 改写）
    predictionReasons: text("prediction_reasons").notNull(), // JSON string[]
    reportSummary: text("report_summary").notNull(),
    reportFactors: text("report_factors").notNull(), // JSON Factor[]
    reportVerdict: text("report_verdict").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    teamIdx: index("players_team_idx").on(t.team),
    valueIndexIdx: index("players_value_index_idx").on(t.valueIndex),
  })
);

// —— 价值指数时序（每日快照，模型训练数据源）——
export const indexHistory = mysqlTable(
  "index_history",
  {
    id: serial("id").primaryKey(),
    playerId: bigint("player_id", { mode: "number", unsigned: true }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    value: double("value").notNull(),
    event: varchar("event", { length: 255 }),
  },
  (t) => ({
    playerDateIdx: uniqueIndex("index_history_player_date_idx").on(t.playerId, t.date),
  })
);

// —— 新闻原始记录 ——
export const newsItems = mysqlTable(
  "news_items",
  {
    id: serial("id").primaryKey(),
    playerId: bigint("player_id", { mode: "number", unsigned: true }).notNull(),
    eventId: bigint("event_id", { mode: "number", unsigned: true }),
    date: date("date", { mode: "string" }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    url: varchar("url", { length: 1000 }),
    content: text("content"),
    source: varchar("source", { length: 100 }).notNull(),
    sourceTier: int("source_tier").notNull(), // 1 权威 / 2 主流 / 3 自媒体
    category: mysqlEnum("category", [
      "竞技爆发",
      "角色提升",
      "合同利好",
      "荣誉认可",
      "商业增值",
      "伤病",
      "角色萎缩",
      "合同纠纷",
      "状态下滑",
      "场外负面",
    ]).notNull(),
    sentiment: double("sentiment").notNull(), // -1 .. +1
    confirmed: boolean("confirmed").notNull().default(true),
    severity: int("severity").notNull().default(2), // 1-3 档
    classifier: varchar("classifier", { length: 20 }).notNull().default("rule-m1"),
    embedding: text("embedding"), // 标题向量（事件聚类用，JSON number[]）
    dedupKey: varchar("dedup_key", { length: 64 }), // 内容哈希，去重用
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    playerDateIdx: index("news_player_date_idx").on(t.playerId, t.date),
    dedupIdx: uniqueIndex("news_dedup_idx").on(t.dedupKey),
  })
);

// —— 事件聚类表（同一事件的转载归并）——
export const newsEvents = mysqlTable("news_events", {
  id: serial("id").primaryKey(),
  playerId: bigint("player_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  bestSourceTier: int("best_source_tier").notNull(),
  bestSentiment: double("best_sentiment").notNull(),
  itemCount: int("item_count").notNull().default(1),
});

// —— 球员每日净情绪值（管道产出，7 日窗口聚合）——
export const sentimentDaily = mysqlTable(
  "sentiment_daily",
  {
    id: serial("id").primaryKey(),
    playerId: bigint("player_id", { mode: "number", unsigned: true }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    netSentiment: double("net_sentiment").notNull(),
    bullishCount: int("bullish_count").notNull().default(0),
    bearishCount: int("bearish_count").notNull().default(0),
    windowEnd: date("window_end", { mode: "string" }).notNull(),
  },
  (t) => ({
    playerDateIdx: uniqueIndex("sentiment_player_date_idx").on(t.playerId, t.date),
  })
);

// —— 预测记录 + 7 天后回填实际值（准确率看板）——
export const predictions = mysqlTable(
  "predictions",
  {
    id: serial("id").primaryKey(),
    playerId: bigint("player_id", { mode: "number", unsigned: true }).notNull(),
    predictDate: date("predict_date", { mode: "string" }).notNull(),
    predictedIndex7d: double("predicted_index_7d").notNull(),
    riseProbability: int("rise_probability").notNull(),
    modelVersion: varchar("model_version", { length: 20 }).notNull().default("M0"),
    actualIndex7d: double("actual_index_7d"),
    hit: boolean("hit"),
  },
  (t) => ({
    playerDateIdx: uniqueIndex("predictions_player_date_idx").on(t.playerId, t.predictDate),
  })
);

// —— 信源抓取状态监控 ——
export const sourceHealth = mysqlTable("source_health", {
  id: serial("id").primaryKey(),
  sourceKey: varchar("source_key", { length: 50 }).notNull().unique(),
  sourceName: varchar("source_name", { length: 100 }).notNull(),
  tier: int("tier").notNull(),
  status: mysqlEnum("status", ["ok", "degraded", "error", "idle"]).notNull().default("idle"),
  lastRunAt: timestamp("last_run_at"),
  lastSuccessAt: timestamp("last_success_at"),
  itemsFetched: int("items_fetched").notNull().default(0),
  errorMessage: varchar("error_message", { length: 500 }),
});

// —— 代理锚定校准记录（2K 评分 / Fantasy ADP / 合同，季度）——
export const anchorCalibrations = mysqlTable("anchor_calibrations", {
  id: serial("id").primaryKey(),
  anchorType: mysqlEnum("anchor_type", ["2k_rating", "fantasy_adp", "contract"]).notNull(),
  quarter: varchar("quarter", { length: 10 }).notNull(), // 如 2026-Q3
  correlation: double("correlation"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;
export type NewsItem = typeof newsItems.$inferSelect;
export type IndexHistoryPoint = typeof indexHistory.$inferSelect;
export type SentimentDaily = typeof sentimentDaily.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type SourceHealth = typeof sourceHealth.$inferSelect;
