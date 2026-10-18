// 情绪引擎公共常量与公式（前后端共享）

/** 新闻窗口：只参考最近 7 天（v2.1） */
export const NEWS_WINDOW_DAYS = 7;

/** 时效衰减半衰期：2 天（v2.1，窗口边界平滑到 0） */
export const DECAY_HALFLIFE_DAYS = 2;

/** 信源层级权重 */
export const TIER_WEIGHT: Record<number, number> = {
  1: 1.0, // 权威（ESPN / NBA 官网 / Shams）
  2: 0.6, // 主流（虎扑 / 直播吧 / 腾讯体育）
  3: 0.4, // 自媒体
};

/** 可信度折减：官宣 ×1.0，传闻 ×0.4 */
export const RUMOR_DISCOUNT = 0.4;

/** 单条新闻有效权重 = 信源权重 × 可信度折减 × 时效衰减 */
export function sentimentWeight(sourceTier: number, confirmed: boolean, daysAgo: number): number {
  const tierW = TIER_WEIGHT[sourceTier] ?? 0.4;
  const confW = confirmed ? 1.0 : RUMOR_DISCOUNT;
  const decay = Math.pow(0.5, daysAgo / DECAY_HALFLIFE_DAYS);
  return tierW * confW * decay;
}
