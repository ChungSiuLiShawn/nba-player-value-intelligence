import { runCollector } from "./base";
import { fetchEspn } from "./espn";
import type { FetchedArticle } from "./types";

// Shams Charania（The Athletic / ESPN 爆料）：
// X（Twitter）已封闭 API，直接抓取其社交账号不可行也不合规。
// 合规替代：从 ESPN 等 Tier1 聚合源中按署名/byline 过滤 Shams 原创爆料，
// 这类稿件在数分钟内会被 ESPN 官网同步发布。
// 若过滤结果为空（近期无其署名稿），属于正常情况，不算采集失败。

const SHAMS_PATTERNS = [/shams\s*charania/i, /shams\b/i];

export async function fetchShams(): Promise<FetchedArticle[]> {
  const espnArticles = await fetchEspn();
  return espnArticles.filter(
    (a) =>
      (a.author && SHAMS_PATTERNS.some((p) => p.test(a.author!))) ||
      SHAMS_PATTERNS.some((p) => p.test(a.snippet ?? ""))
  );
}

export function runShams() {
  return runCollector("shams", fetchShams);
}
