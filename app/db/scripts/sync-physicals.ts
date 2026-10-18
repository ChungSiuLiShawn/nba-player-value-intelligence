/**
 * 物理基本盘同步：ESPN 球员详情抓取身高/体重 → 位置规范推算臂展/弹跳/力量
 * → 计算物理维度分（0-100）+ 写入 espnId（头像 URL 用）。
 * Run: npx tsx db/scripts/sync-physicals.ts
 */
import { readFileSync } from "node:fs";
import { getDb } from "../../api/queries/connection";
import { players } from "../schema";
import { eq } from "drizzle-orm";

const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const SEASON = 2026;
const UA = { "User-Agent": "Mozilla/5.0 (NBA-Value-Intel research prototype)" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const NAME_ALIASES: Record<string, string> = {
  "Herb Jones": "Herbert Jones",
  "Jimmy Butler": "Jimmy Butler III",
  "Lu Dort": "Luguentz Dort",
};

// 本赛季未出场球员（espn_athletes.json 无记录），直接映射 ESPN id
const ID_OVERRIDES: Record<string, string> = {
  "Kyrie Irving": "6442",
  "Tyrese Haliburton": "4396993",
  "Damian Lillard": "6606",
  "Fred VanVleet": "2991230",
};

// —— 位置规范（NBA 体测统计口径）——
// 臂展-身高差（英寸）、垂直弹跳（英寸）典型均值
const POS_NORMS: Record<string, { apeIndex: number; vert: number }> = {
  PG: { apeIndex: 4.0, vert: 33 },
  SG: { apeIndex: 4.5, vert: 34 },
  SF: { apeIndex: 5.0, vert: 33 },
  PF: { apeIndex: 5.5, vert: 31 },
  C: { apeIndex: 6.0, vert: 28 },
};
// 全联盟物理基准（用于归一化）
const LEAGUE = {
  height: { min: 70, max: 88 }, // 5'10" - 7'4"
  wingspan: { min: 72, max: 96 },
  vert: { min: 24, max: 40 },
  bmi: { min: 22, max: 29 }, // 力量代理指标
};

const clamp01 = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

interface Phys {
  heightIn: number;
  weightLbs: number;
  wingspanIn: number;
  verticalIn: number;
  strengthScore: number;
  scorePhysical: number;
}

function estimatePhysical(position: string, heightIn: number, weightLbs: number): Phys {
  const normPos = POS_NORMS[position] ? position : "SF";
  const n = POS_NORMS[normPos];
  // 臂展 = 身高 + 位置典型 ape index（微随身高增长）
  const wingspanIn = +(heightIn + n.apeIndex + (heightIn - 78) * 0.08).toFixed(1);
  // 弹跳：位置基准，随身高/体重递减（大个子跳得低）
  const verticalIn = +Math.max(
    LEAGUE.vert.min,
    Math.min(LEAGUE.vert.max, n.vert - (heightIn - 78) * 0.35 - (weightLbs - 215) * 0.02),
  ).toFixed(1);
  // 力量：BMI 为主 + 体重修正（内线加权）
  const bmi = (weightLbs / (heightIn * heightIn)) * 703;
  const posBoost = normPos === "C" ? 6 : normPos === "PF" ? 3 : 0;
  const strengthScore = Math.round(clamp01(bmi + posBoost * 0.15, LEAGUE.bmi.min, LEAGUE.bmi.max) * 100);
  // 物理综合分：臂展 35% + 身高 20% + 弹跳 25% + 力量 20%
  const scorePhysical = Math.round(
    clamp01(wingspanIn, LEAGUE.wingspan.min, LEAGUE.wingspan.max) * 35 +
      clamp01(heightIn, LEAGUE.height.min, LEAGUE.height.max) * 20 +
      clamp01(verticalIn, LEAGUE.vert.min, LEAGUE.vert.max) * 25 +
      (strengthScore / 100) * 20,
  );
  return { heightIn, weightLbs, wingspanIn, verticalIn, strengthScore, scorePhysical };
}

async function main() {
  const db = getDb();
  const map: Record<string, { name: string; team: string }> = JSON.parse(
    readFileSync("db/espn_athletes.json", "utf-8"),
  );
  // 本地名 → espn id
  const idByName = new Map<string, string>();
  for (const [id, meta] of Object.entries(map)) idByName.set(norm(meta.name), id);

  const locals = await db
    .select({ id: players.id, nameEn: players.nameEn, position: players.position })
    .from(players);

  let updated = 0;
  const missing: string[] = [];
  const BATCH = 5;
  for (let i = 0; i < locals.length; i += BATCH) {
    const batch = locals.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (p) => {
        const espnId =
          ID_OVERRIDES[p.nameEn] ?? idByName.get(norm(NAME_ALIASES[p.nameEn] ?? p.nameEn));
        if (!espnId) {
          missing.push(p.nameEn);
          return;
        }
        try {
          const res = await fetch(`${CORE}/seasons/${SEASON}/athletes/${espnId}?lang=en&region=us`, { headers: UA });
          if (!res.ok) throw new Error(String(res.status));
          const a: any = await res.json();
          const heightIn = a.height ?? 0;
          const weightLbs = a.weight ?? 0;
          if (!heightIn || !weightLbs) {
            missing.push(p.nameEn + " (no h/w)");
            return;
          }
          const phys = estimatePhysical(p.position, heightIn, weightLbs);
          await db
            .update(players)
            .set({ ...phys, espnId })
            .where(eq(players.id, p.id));
          updated++;
        } catch {
          missing.push(p.nameEn + " (fetch)");
        }
      }),
    );
    await sleep(120);
  }
  console.log(JSON.stringify({ updated, missing }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
