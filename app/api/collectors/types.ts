// 采集器公共类型与合规说明
// 合规策略：低频只读采集公开 RSS / 官方 JSON 接口；
//   Tier1 每小时一次，Tier2 每日两次；不抓取用户内容、不绕过反爬。
//   若目标站点返回 403/Access Denied，采集器记录错误并跳过，绝不尝试绕过。

export interface FetchedArticle {
  title: string;
  url: string;
  publishedAt: Date;
  snippet?: string;
  author?: string;
}

export interface SourceResult {
  sourceKey: string;
  articles: FetchedArticle[];
  error?: string;
}

export const USER_AGENT =
  "NBA-Value-Intel/0.1 (+trend-level read-only collector; contact: admin)";

/** 礼貌延时（毫秒）—— 同一信源的连续请求之间强制间隔 */
export function politeDelay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
