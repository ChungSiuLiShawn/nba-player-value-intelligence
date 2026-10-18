/**
 * Tier 2 中文信源采集器（权重 0.6，每日两次低频只读）
 * - 直播吧：news.zhibo8.com/nba/more.htm 静态列表页（含时间与来源）
 * - 虎扑：voice.hupu.com/nba 内嵌 __NEXT_DATA__ JSON（50 条）
 * 合规：每 12 小时一次、只读、不绕过反爬；403/错误只记录跳过。
 */
import { runCollector, politeDelay, type FetchedArticle, type SourceResult } from "./base";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NBA-Value-Intel/0.1 (low-frequency read-only)";

// —— 直播吧 ——
async function fetchZhibo8(): Promise<FetchedArticle[]> {
  const res = await fetch("https://news.zhibo8.com/nba/more.htm", {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const articles: FetchedArticle[] = [];
  const re =
    /<li data-label="[^"]*"><span class="articleTitle"><a href="(\/\/news\.zhibo8\.com\/nba\/[^"]+)">([^<]+)<\/a><\/span><span class="source">([^<]*)<\/span><span class="postTime">([^<]*)<\/span><\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && articles.length < 60) {
    const [, href, title, source, time] = m;
    articles.push({
      title: title.trim(),
      url: "https:" + href,
      snippet: `来源：${source.trim()}`,
      publishedAt: time.trim()
        ? new Date(time.trim().replace(" ", "T") + "+08:00")
        : new Date(),
    });
  }
  return articles;
}

// —— 虎扑 ——
async function fetchHupu(): Promise<FetchedArticle[]> {
  const res = await fetch("https://voice.hupu.com/nba", {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s,
  );
  if (!m) throw new Error("NEXT_DATA not found");
  const data = JSON.parse(m[1]);
  const items: { title?: string; url?: string; time?: string }[] =
    data?.props?.pageProps?.data ?? [];
  return items
    .filter((it) => it.title && it.url)
    .slice(0, 50)
    .map((it) => ({
      title: String(it.title).trim(),
      url: String(it.url),
      snippet: "",
      publishedAt: parseRelativeTime(String(it.time ?? "")),
    }));
}

function parseRelativeTime(t: string): Date {
  const now = Date.now();
  const m = t.match(/(\d+)\s*(分钟|小时|天)前/);
  if (!m) return new Date(now);
  const n = Number(m[1]);
  const ms =
    m[2] === "分钟" ? n * 60_000 : m[2] === "小时" ? n * 3_600_000 : n * 86_400_000;
  return new Date(now - ms);
}

export async function runTier2(): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  results.push(await runCollector("zhibo8", fetchZhibo8));
  await politeDelay(3000);
  results.push(await runCollector("hupu", fetchHupu));
  return results;
}
