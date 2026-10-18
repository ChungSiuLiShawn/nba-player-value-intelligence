import { getDb } from "../queries/connection";
import { players } from "@db/schema";

// 球员实体识别（主角判定）：
// 用球员姓名（英文全名 / 常见简称 / 中文名）在新闻标题与摘要中做边界匹配，
// 返回命中的球员数据库 id。多位球员同时出现时按命中次数排序（主角优先）。

interface PlayerRef {
  id: number;
  nameZh: string;
  nameEn: string;
  aliases: string[];
}

let cache: PlayerRef[] | null = null;

/** 生成匹配别名：全名、姓氏、中文名（全名 + 短名）、英文连字符拆解 */
function buildAliases(nameEn: string, nameZh: string): string[] {
  const aliases = new Set<string>();
  const en = nameEn.trim();
  aliases.add(en);
  const parts = en.split(/\s+/);
  if (parts.length > 1) {
    aliases.add(parts[parts.length - 1]); // 姓氏
    aliases.add(parts[0]); // 名（如 LeBron 这类单名球星）
  }
  const zh = nameZh.replace(/·/g, "");
  aliases.add(zh);
  // 中文短名：取「·」后段（中文媒体高频用法：约基奇/东契奇/文班亚马）
  // 部分球员后段仍带首名（维克托文班亚马）→ 进一步裁掉前 2-3 字取尾段
  const zhParts = nameZh.split("·");
  if (zhParts.length > 1) {
    const last = zhParts[zhParts.length - 1];
    aliases.add(last);
    if (last.length >= 5) {
      // 维克托文班亚马 → 文班亚马（去掉与名等长的前缀）
      // 尾段至少 3 字才收，避免「阿夫迪亚→迪亚」这类泛化碎片误伤
      const firstLen = zhParts[0].length;
      const tail = last.slice(firstLen);
      if (last.length > firstLen && tail.length >= 3) aliases.add(tail);
    }
    // 高辨识度球员的中文截短称呼（文班亚马→文班）：白名单驱动，宁缺毋滥
    const extra = ZH_SHORTHAND[nameEn];
    if (extra) for (const a of extra) aliases.add(a);
  }
  return [...aliases].filter((a) => a.length >= 2);
}

/** 中文媒体截短称呼白名单（仅收录无歧义的高频用法） */
const ZH_SHORTHAND: Record<string, string[]> = {
  "Victor Wembanyama": ["文班"],
};

export async function loadPlayerRefs(): Promise<PlayerRef[]> {
  if (cache) return cache;
  const rows = await getDb()
    .select({ id: players.id, nameZh: players.nameZh, nameEn: players.nameEn })
    .from(players);
  cache = rows.map((r) => ({
    id: r.id,
    nameZh: r.nameZh,
    nameEn: r.nameEn,
    aliases: buildAliases(r.nameEn, r.nameZh),
  }));
  return cache;
}

export function invalidatePlayerCache() {
  cache = null;
}

/** 在一篇文章中匹配球员，按命中强度返回 id 列表（最可能的主角在前） */
export function matchPlayers(
  refs: PlayerRef[],
  text: string
): { playerId: number; hits: number }[] {
  const lower = text.toLowerCase();
  const hits = new Map<number, number>();
  for (const ref of refs) {
    let count = 0;
    for (const alias of ref.aliases) {
      const a = alias.toLowerCase();
      if (/[一-鿿]/.test(a)) {
        // 中文别名：\b 对 CJK 无效，直接子串匹配
        if (lower.includes(a)) count += 1;
      } else {
        // 英文别名做单词边界匹配，避免 "Curry" 命中 "curren" 之类
        const re = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
        const found = lower.match(re);
        if (found) count += found.length;
      }
    }
    if (count > 0) hits.set(ref.id, count);
  }
  return [...hits.entries()]
    .map(([playerId, n]) => ({ playerId, hits: n }))
    .sort((a, b) => b.hits - a.hits);
}
