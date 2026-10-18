/**
 * One-off: regenerate predictionReasons / reportSummary / reportFactors /
 * reportVerdict in English, derived from each player's live data.
 * Run: npx tsx db/scripts/english-reports.ts
 */
import { getDb } from "../../api/queries/connection";
import { players } from "../schema";
import { eq } from "drizzle-orm";

interface Factor {
  name: string;
  change: string;
  direction: "up" | "down" | "flat";
  contribution: number;
}

function dimLabel(k: string): string {
  return (
    {
      performance: "On-court performance",
      role: "Team role",
      sentiment: "News sentiment",
      contract: "Contract situation",
      age: "Age curve",
      commercial: "Brand value",
    }[k] ?? k
  );
}

async function main() {
  const db = getDb();
  const rows = await db.select().from(players);
  let updated = 0;

  for (const p of rows) {
    const name: string = p.nameEn;
    const ch30: number = p.change30d;
    const ch7: number = p.change7d;
    const senti: number = p.sentiment7d;
    const rising = ch7 > 0.05;
    const falling = ch7 < -0.05;

    const dims: [string, number][] = [
      ["performance", p.scorePerformance],
      ["role", p.scoreRole],
      ["sentiment", p.scoreSentiment],
      ["contract", p.scoreContract],
      ["age", p.scoreAge],
      ["commercial", p.scoreCommercial],
    ];
    const sorted = [...dims].sort((a, b) => b[1] - a[1]);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];

    // ---- predictionReasons ----
    const reasons: string[] = [];
    if (strongest[1] >= 80)
      reasons.push(`${dimLabel(strongest[0])} is elite (${strongest[1]}/100), anchoring the index`);
    else if (strongest[1] >= 60)
      reasons.push(`${dimLabel(strongest[0])} is a relative strength (${strongest[1]}/100)`);
    if (senti > 0.5)
      reasons.push(`Net 7-day sentiment +${senti.toFixed(1)} — news flow is clearly bullish`);
    else if (senti < -0.5)
      reasons.push(`Net 7-day sentiment ${senti.toFixed(1)} — news flow is a headwind`);
    else reasons.push("News flow is quiet; the index tracks fundamentals only");
    if (p.age <= 24) reasons.push(`Age ${p.age} — prime of the growth curve, upside priced in`);
    else if (p.age >= 33) reasons.push(`Age ${p.age} — late-career decline risk weighs on the curve`);
    else reasons.push(`Age ${p.age} — peak-years stability`);
    if (weakest[1] < 45)
      reasons.push(`${dimLabel(weakest[0])} (${weakest[1]}/100) is the main drag on valuation`);
    const finalReasons = reasons.slice(0, 3);

    // ---- reportSummary ----
    const dir30 = ch30 > 0 ? `+${ch30.toFixed(1)}` : ch30.toFixed(1);
    const summary = rising
      ? `${name}'s value index is up ${dir30} over the last 30 days, driven by ${dimLabel(strongest[0]).toLowerCase()} with ${senti >= 0 ? "supportive" : "mixed"} news sentiment.`
      : falling
        ? `${name}'s value index moved ${dir30} over the last 30 days; ${dimLabel(weakest[0]).toLowerCase()} is the main pressure point.`
        : `${name}'s value index is flat over the last 30 days (${dir30}); no material news catalyst in the 7-day window.`;

    // ---- reportFactors ----
    const factors: Factor[] = sorted.slice(0, 3).map(([k, v]) => {
      const direction: Factor["direction"] = v >= 65 ? "up" : v <= 40 ? "down" : "flat";
      return {
        name: `${dimLabel(k)} — ${v >= 65 ? "strength" : v <= 40 ? "weakness" : "neutral"}`,
        change: `score ${v}/100`,
        direction,
        contribution: Math.max(10, Math.min(60, Math.round(Math.abs(v - 50) * 1.5))),
      };
    });
    // normalize contributions to ~100
    const total = factors.reduce((s, f) => s + f.contribution, 0) || 1;
    factors.forEach((f) => (f.contribution = Math.round((f.contribution / total) * 100)));

    // ---- reportVerdict ----
    const verdict = rising
      ? `Verdict: bullish — momentum and fundamentals align; watch for sentiment continuation.`
      : falling
        ? `Verdict: bearish — near-term pressure dominates; wait for news flow to stabilize.`
        : `Verdict: neutral — no strong signal; index expected to track fundamentals.`;

    await db
      .update(players)
      .set({
        predictionReasons: JSON.stringify(finalReasons),
        reportSummary: summary,
        reportFactors: JSON.stringify(factors),
        reportVerdict: verdict,
      })
      .where(eq(players.id, p.id));
    updated++;
  }
  console.log(`updated ${updated} players`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
