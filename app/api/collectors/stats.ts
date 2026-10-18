/**
 * 真实赛况数据同步（ESPN core API，每日一次）
 * 抓取全联盟球员赛季场均数据 → 匹配到本地球员 → 更新 15 项计数 + TS%/GMSC
 * → 按 GMSC 联盟百分位重算「竞技表现」维度分。
 */
import { readFileSync } from "node:fs";
import { getDb } from "../queries/connection";
import { players, sourceHealth } from "@db/schema";
import { eq } from "drizzle-orm";

const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const SEASON = 2026; // 2025-26 赛季
const UA = { "User-Agent": "Mozilla/5.0 (NBA-Value-Intel research prototype)" };

// ESPN 球队缩写 → 本地中文队名
const ABBR_TO_TEAM: Record<string, string> = {
  DEN: "掘金", LAL: "湖人", SAS: "马刺", OKC: "雷霆", BOS: "凯尔特人",
  GSW: "勇士", MIL: "雄鹿", PHI: "76人", PHX: "太阳", MIN: "森林狼",
  DAL: "独行侠", NOP: "鹈鹕", SAC: "国王", IND: "步行者", MIA: "热火",
  MEM: "灰熊", CLE: "骑士", NYK: "尼克斯", ATL: "老鹰", ORL: "魔术",
  DET: "活塞", TOR: "猛龙", CHI: "公牛", BKN: "篮网", CHA: "黄蜂",
  WAS: "奇才", HOU: "火箭", LAC: "快船", UTAH: "爵士", POR: "开拓者",
};

// 本地名与 ESPN 显示名不一致时的手工别名（unmatched 报告中补充）
const NAME_ALIASES: Record<string, string> = {
  "Nic Claxton": "Nicolas Claxton",
  "Cam Thomas": "Cameron Thomas",
  "Herb Jones": "Herbert Jones",
  "Ron Holland": "Ronald Holland II",
  "Jabari Smith Jr.": "Jabari Smith Jr.",
  "Derrick Jones Jr.": "Derrick Jones Jr.",
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface EspnAthleteMap {
  [id: string]: { name: string; team: string };
}

function loadMap(): EspnAthleteMap {
  return JSON.parse(readFileSync("db/espn_athletes.json", "utf-8"));
}

// GMSC（Hollinger Game Score，场均口径）
function gmScOf(s: {
  pts: number; fgm: number; fga: number; ftm: number; fta: number;
  oreb: number; dreb: number; stl: number; ast: number; blk: number; pf: number; tov: number;
}) {
  return +(
    s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) +
    0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk -
    0.4 * s.pf - s.tov
  ).toFixed(1);
}

async function recordHealth(status: "ok" | "error", fetched: number, errorMessage?: string) {
  const db = getDb();
  await db
    .insert(sourceHealth)
    .values({
      sourceKey: "espn-stats",
      sourceName: "ESPN Stats",
      tier: 1,
      status,
      lastRunAt: new Date(),
      lastSuccessAt: status === "ok" ? new Date() : null,
      itemsFetched: fetched,
      errorMessage: errorMessage ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        status,
        lastRunAt: new Date(),
        lastSuccessAt: status === "ok" ? new Date() : undefined,
        itemsFetched: fetched,
        errorMessage: errorMessage ?? null,
      },
    });
}

export async function syncSeasonStats() {
  const db = getDb();
  try {
    const res = await fetch(
      `${CORE}/seasons/${SEASON}/types/2/statistics/0/byathlete?limit=600&lang=en&region=us`,
      { headers: UA },
    );
    if (!res.ok) throw new Error(`ESPN stats HTTP ${res.status}`);
    const data: any = await res.json();
    const athleteMap = loadMap();

    // ESPN 球员名 → 场均数据
    interface Row {
      gp: number; min: number; pts: number; ast: number; oreb: number; dreb: number;
      stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number;
      p3m: number; p3a: number; ftm: number; fta: number; tsPct: number; team: string;
    }
    const byName = new Map<string, Row>();
    for (const item of data.items as any[]) {
      const id = item.athlete.$ref.match(/athletes\/(\d+)/)?.[1];
      const meta = id ? athleteMap[id] : undefined;
      if (!meta) continue;
      const get = (cat: string, name: string): number => {
        const c = (item.splits.categories as any[]).find((x) => x.name === cat);
        const s = c?.stats?.find((x: any) => x.name === name);
        return s?.value ?? 0;
      };
      const gp = get("general", "gamesPlayed");
      if (!gp) continue;
      const row: Row = {
        gp,
        min: +get("general", "avgMinutes").toFixed(1),
        pts: +get("offensive", "avgPoints").toFixed(1),
        ast: +get("offensive", "avgAssists").toFixed(1),
        oreb: +(get("offensive", "offensiveRebounds") / gp).toFixed(1),
        dreb: +(get("defensive", "defensiveRebounds") / gp).toFixed(1),
        stl: +get("defensive", "avgSteals").toFixed(1),
        blk: +get("defensive", "avgBlocks").toFixed(1),
        tov: +get("offensive", "avgTurnovers").toFixed(1),
        pf: +get("general", "avgFouls").toFixed(1),
        fgm: +get("offensive", "avgFieldGoalsMade").toFixed(1),
        fga: +get("offensive", "avgFieldGoalsAttempted").toFixed(1),
        p3m: +get("offensive", "avgThreePointFieldGoalsMade").toFixed(1),
        p3a: +get("offensive", "avgThreePointFieldGoalsAttempted").toFixed(1),
        ftm: +get("offensive", "avgFreeThrowsMade").toFixed(1),
        fta: +get("offensive", "avgFreeThrowsAttempted").toFixed(1),
        tsPct: +(get("offensive", "trueShootingPct") / 100).toFixed(3),
        team: ABBR_TO_TEAM[meta.team] ?? "",
      };
      byName.set(norm(meta.name), row);
    }

    // 匹配本地球员并更新
    const locals = await db
      .select({ id: players.id, nameEn: players.nameEn, team: players.team })
      .from(players);
    const unmatched: string[] = [];
    let updated = 0;
    const gmScById = new Map<number, number>();

    for (const p of locals) {
      const alias = NAME_ALIASES[p.nameEn] ?? p.nameEn;
      let row = byName.get(norm(alias));
      if (!row) {
        // 兜底：姓 + 名首字母
        const parts = norm(alias).split(" ");
        const last = parts[parts.length - 1];
        const first0 = parts[0]?.[0] ?? "";
        for (const [k, v] of byName) {
          const kp = k.split(" ");
          if (kp[kp.length - 1] === last && kp[0]?.[0] === first0) {
            row = v;
            break;
          }
        }
      }
      if (!row) {
        // ESPN 本赛季无数据 = 赛季报销/未出场（如 Lillard、Haliburton、Kyrie）
        // 清零计数数据，保持与现实一致
        await db
          .update(players)
          .set({
            gp: 0, min: 0, pts: 0, ast: 0, oreb: 0, dreb: 0, stl: 0, blk: 0,
            tov: 0, pf: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
            tsPct: 0, gmSc: 0, scorePerformance: 0,
          })
          .where(eq(players.id, p.id));
        unmatched.push(p.nameEn);
        continue;
      }
      const gmSc = gmScOf(row);
      gmScById.set(p.id, gmSc);
      await db
        .update(players)
        .set({
          gp: row.gp, min: row.min, pts: row.pts, ast: row.ast,
          oreb: row.oreb, dreb: row.dreb, stl: row.stl, blk: row.blk,
          tov: row.tov, pf: row.pf, fgm: row.fgm, fga: row.fga,
          p3m: row.p3m, p3a: row.p3a, ftm: row.ftm, fta: row.fta,
          tsPct: row.tsPct, gmSc,
          ...(row.team && row.team !== p.team ? { team: row.team } : {}),
        })
        .where(eq(players.id, p.id));
      updated++;
    }

    // GMSC 联盟百分位 → 竞技表现维度分（0-100）
    const sorted = [...gmScById.values()].sort((a, b) => a - b);
    for (const [id, gmSc] of gmScById) {
      const below = sorted.filter((v) => v < gmSc).length;
      const pct = Math.round((below / Math.max(1, sorted.length)) * 100);
      await db.update(players).set({ scorePerformance: pct }).where(eq(players.id, id));
    }

    await recordHealth("ok", updated);
    return { espnPlayers: byName.size, updated, unmatched };
  } catch (e) {
    await recordHealth("error", 0, String(e).slice(0, 400));
    throw e;
  }
}
