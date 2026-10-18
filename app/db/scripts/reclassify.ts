import { reclassifyAll } from "../../api/collectors/run";
async function main() {
  const r = await reclassifyAll();
  console.log(JSON.stringify(r));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
