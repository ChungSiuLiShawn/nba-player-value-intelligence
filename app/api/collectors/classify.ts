// M1 规则分类器（语境感知版）：
// 相比 M0 的关键升级——
//   1) 否定/转折窗口：关键词命中后检查前后语境的否定词（stall / fail / deny / not / 未 / 否认），
//      翻转或降级倾向（修复 "Extension talks stall" 被误判为合同利好 的问题）
//   2) 正负双向词典：合同类区分 "agree/sign"（利好）与 "talks stall / holdout / trade request"（利空）
//   3) 严重度分层：核心事件词（重伤、交易、顶薪）权重更高
// LLM 分类留作可插拔升级位（见 llm.ts）：凭证可用时替换本分类器。

export type NewsCategoryEn =
  | "竞技爆发" | "角色提升" | "合同利好" | "荣誉认可" | "商业增值"
  | "伤病" | "角色萎缩" | "合同纠纷" | "状态下滑" | "场外负面";

interface Rule {
  category: NewsCategoryEn;
  base: number; // 基础倾向（-1..+1）
  keywords: RegExp[];
  /** 命中这些词时翻转/压制倾向（否定语境） */
  negators?: RegExp[];
  /** 严重度加权词（如 season-ending / torn ACL / 顶薪） */
  severe?: RegExp[];
}

const NEG_EN = /\b(stall(s|ed|ing)?|fail(s|ed|ing)?|den(y|ies|ied)|not\b|no\b|without|unlikely|doubt|won't|didn't|haven't|hasn't)/i;
const NEG_ZH = /(未(?!来)|没有|无缘|否认|停滞|搁置|破裂|告吹|拒绝)/;

const RULES: Rule[] = [
  // —— 利空优先匹配（防止利好词先抢）——
  {
    category: "伤病", base: -0.8,
    keywords: [/injur/i, /sprain/i, /fracture/i, /surgery/i, /out indefinitely/i, /torn/i, /strain/i, /not cleared/i, /ruled out/i, /受伤/, /扭伤/, /骨折/, /手术/, /报销/, /缺阵/],
    severe: [/season[- ]ending/i, /torn (acl|achilles)/i, /out for (the )?season/i, /赛季报销/],
    negators: [/return(s|ed|ing)? (from|to)/i, /cleared/i, /back from/i, /复出/, /伤愈/], // 伤愈复出 → 降级为弱利好信号
  },
  {
    category: "场外负面", base: -0.6,
    keywords: [/arrest/i, /suspend/i, /\bfine[ds]?\b/i, /investigation/i, /gambl/i, /domestic/i, /被捕/, /禁赛/, /罚款/, /被调查/],
    severe: [/indefinite suspension/i, /lifetime/i, /终身禁赛/],
  },
  {
    category: "合同纠纷", base: -0.5,
    keywords: [/talks? stall/i, /stall(s|ed|ing)? .*extension/i, /holdout/i, /hold[- ]out/i, /demands? a trade/i, /request(s|ed)? a trade/i, /trade demand/i, /no progress/i, /friction/i, /申请交易/, /合同纠纷/, /罢训/, /谈判(停滞|破裂|陷入僵局)/, /(续约|谈判).{0,6}僵局/, /体重条款/, /不满.{0,8}报价/],
  },
  {
    category: "状态下滑", base: -0.4,
    keywords: [/slump/i, /struggl/i, /benched/i, /scoreless/i, /career[- ]low/i, /shooting woes/i, /低迷/, /状态下滑/, /生涯新低/, /跌至/, /不升反降/, /百大.{0,15}(下滑|下跌)/, /体重超标/],
  },
  {
    category: "角色萎缩", base: -0.3,
    keywords: [/reduced role/i, /out of (the )?rotation/i, /minutes? cut/i, /\bdnp\b/i, /waive[ds]?\b/i, /released by/i, /跌出轮换/, /边缘化/, /被裁/],
  },
  // —— 利好 ——
  {
    category: "竞技爆发", base: 0.7,
    keywords: [/career[- ]high/i, /triple[- ]double/i, /drops? \d{2,}/i, /\d{2,}-point/i, /game[- ]winner/i, /buzzer[- ]beater/i, /dominat/i, /生涯新高/, /三双/, /绝杀/, /统治/],
    severe: [/50[- ]point|60[- ]point/i, /\b(5[0-9]|6[0-9])\s?(points|pts)\b/i],
  },
  {
    category: "荣誉认可", base: 0.6,
    keywords: [/\bmvp\b/i, /all[- ]star/i, /all[- ]nba/i, /player of the (week|month)/i, /rookie of the/i, /award/i, /\bdpoy\b/i, /全明星/, /最佳阵/, /月最佳/, /周最佳/, /百大.{0,15}(提升|窜至|升至|上升|首次进)/, /历史唯[一二三四五六七八九]/],
    severe: [/mvp (favorit|front[- ]runner|leader)/i, /unanimous/i],
  },
  {
    category: "合同利好", base: 0.5,
    keywords: [/agree(s|d)? (to|on) (a )?(deal|contract|extension)/i, /sign(s|ed)? (a )?(contract|deal|extension)/i, /max (contract|deal|extension)/i, /extension with/i, /续约/, /顶薪/, /签下/, /达成协议/],
    negators: [NEG_EN, NEG_ZH], // "talks stall / 未达成协议" → 不算利好
    severe: [/supermax/i, /\$\d{3}M|超级顶薪/],
  },
  {
    category: "角色提升", base: 0.4,
    keywords: [/start(ing|s)? (lineup|at|five)/i, /promoted/i, /more minutes/i, /first[- ]team/i, /taking over/i, /cleared (for|to) (camp|play|return)/i, /return(s|ed|ing)? (from injury|to (the )?lineup)/i, /首发/, /提上/, /核心地位/, /复出/],
  },
  {
    category: "商业增值", base: 0.3,
    keywords: [/endorsement/i, /sponsorship/i, /signature shoe/i, /jersey sales/i, /\bbrand\b/i, /代言/, /签名鞋/, /球衣销量/],
  },
];

export interface Classification {
  category: NewsCategoryEn;
  sentiment: number; // -1..+1
  severity: 1 | 2 | 3;
  classifier: "rule-m1";
}

function contextHasNegator(text: string, matchIndex: number): boolean {
  const window = text.slice(Math.max(0, matchIndex - 60), matchIndex + 60);
  return NEG_EN.test(window) || NEG_ZH.test(window);
}

/** 规则分类（M1 语境感知）；无法判定返回 null */
export function classifyArticle(text: string): Classification | null {
  let best: { rule: Rule; hits: number; negated: boolean; severe: boolean } | null = null;

  for (const rule of RULES) {
    let hits = 0;
    let firstIdx = -1;
    for (const re of rule.keywords) {
      const m = text.match(re);
      if (m) {
        hits++;
        if (firstIdx < 0) firstIdx = m.index ?? 0;
      }
    }
    if (hits === 0) continue;
    const negated =
      (rule.negators?.some((re) => re.test(text)) ?? false) ||
      (rule.category === "合同利好" && firstIdx >= 0 && contextHasNegator(text, firstIdx));
    const severe = rule.severe?.some((re) => re.test(text)) ?? false;
    if (!best || hits > best.hits || (hits === best.hits && Math.abs(rule.base) > Math.abs(best.rule.base))) {
      best = { rule, hits, negated, severe };
    }
  }
  if (!best) return null;

  // 否定语境：利好被压制为中性偏空；伤病类的"复出/伤愈"语境反转为弱利好
  let sentiment = best.rule.base;
  if (best.negated) {
    if (best.rule.category === "伤病") {
      // 复出/伤愈：从利空翻转为弱利好（角色回归）
      return { category: "角色提升", sentiment: 0.35, severity: 2, classifier: "rule-m1" };
    }
    sentiment = Math.min(sentiment, -0.2); // 利好消息被否定 → 至少微利空
  }

  const severity: 1 | 2 | 3 = best.severe ? 3 : best.hits >= 2 ? 2 : 1;
  const scaled = sentiment * (0.75 + severity * 0.125); // 严重度放大
  return {
    category: best.rule.category,
    sentiment: +Math.max(-1, Math.min(1, scaled)).toFixed(2),
    severity,
    classifier: "rule-m1",
  };
}

/** 传闻判定 */
export function isRumor(text: string): boolean {
  return /rumou?r/i.test(text) || /reportedly/i.test(text) || /sources (say|tell)/i.test(text) || /据(称|悉)/.test(text) || /传闻/.test(text);
}
