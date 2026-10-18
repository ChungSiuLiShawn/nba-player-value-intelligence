/**
 * One-off: build ESPN athlete id → { name, teamAbbr } map (db/espn_athletes.json).
 * Athlete IDs are stable; rerun only when new players enter the league.
 * Run: npx tsx db/scripts/build-espn-map.ts
 */
import { writeFileSync } from "node:fs";

const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const SEASON = 2026; // 2025-26 season
const UA = { "User-Agent": "Mozilla/5.0 (NBA-Value-Intel research prototype)" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jget(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function main() {
  // 1. all teams: id → abbreviation
  const teams = await jget(`${CORE}/teams?limit=40`);
  const teamAbbr: Record<string, string> = {};
  for (const t of teams.items) {
    const id = t.$ref.match(/teams\/(\d+)/)?.[1];
    if (!id) continue;
    const detail = await jget(t.$ref.replace("http://", "https://"));
    teamAbbr[id] = detail.abbreviation;
    await sleep(80);
  }
  console.log("teams:", Object.keys(teamAbbr).length);

  // 2. all athlete ids with stats this season
  const stats = await jget(
    `${CORE}/seasons/${SEASON}/types/2/statistics/0/byathlete?limit=600&lang=en&region=us`,
  );
  const ids: string[] = stats.items
    .map((i: any) => i.athlete.$ref.match(/athletes\/(\d+)/)?.[1])
    .filter(Boolean);
  console.log("athletes with stats:", ids.length);

  // 3. fetch each athlete (batched, polite)
  const map: Record<string, { name: string; team: string }> = {};
  const BATCH = 5;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          const a = await jget(
            `${CORE}/seasons/${SEASON}/athletes/${id}?lang=en&region=us`,
          );
          const teamId = a.team?.$ref?.match(/teams\/(\d+)/)?.[1];
          return { id, name: a.displayName as string, team: teamAbbr[teamId] ?? "" };
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) if (r) map[r.id] = { name: r.name, team: r.team };
    if (i % 50 === 0) console.log(`  ${i}/${ids.length}`);
    await sleep(150);
  }

  writeFileSync("db/espn_athletes.json", JSON.stringify(map, null, 1));
  console.log("saved", Object.keys(map).length, "athletes → db/espn_athletes.json");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
