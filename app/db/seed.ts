/**
 * Seed script — DEPRECATED as of Phase C.
 *
 * The static dataset (src/data/players) was removed when the frontend switched
 * to live tRPC data. The MySQL database is now the single source of truth:
 * players were seeded by the Phase A pipeline and are maintained by the
 * hourly collectors + daily sentiment jobs.
 *
 * This script is kept as a sanity check: it verifies the players table is
 * populated and refuses to wipe anything. Run with: npx tsx db/seed.ts
 */
import { getDb } from "../api/queries/connection";
import { players } from "./schema";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(players);
  const count = Number(row?.n ?? 0);
  if (count === 0) {
    console.log(
      "players table is EMPTY — seed via the Phase A pipeline (collectors), not this script.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`players table OK: ${count} players present. No seeding needed.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
