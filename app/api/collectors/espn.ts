import { fetchRss, fetchJson, runCollector } from "./base";
import type { FetchedArticle } from "./types";

// ESPN NBA 新闻：官方 RSS（主）+ site.api JSON（备）。
// 两者均为 ESPN 公开端点，低频只读。

const ESPN_RSS = "https://www.espn.com/espn/rss/nba/news";
const ESPN_API =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=50";

interface EspnApiResponse {
  articles?: {
    headline?: string;
    links?: { web?: { href?: string } };
    published?: string;
    description?: string;
    byline?: string;
  }[];
}

async function viaApi(): Promise<FetchedArticle[]> {
  const data = await fetchJson<EspnApiResponse>(ESPN_API);
  return (data.articles ?? [])
    .filter((a) => a.headline && a.links?.web?.href)
    .map((a) => ({
      title: a.headline!.trim(),
      url: a.links!.web!.href!,
      publishedAt: a.published ? new Date(a.published) : new Date(),
      snippet: (a.description ?? "").slice(0, 500),
      author: a.byline,
    }));
}

export async function fetchEspn(): Promise<FetchedArticle[]> {
  try {
    return await viaApi();
  } catch {
    return fetchRss(ESPN_RSS);
  }
}

export function runEspn() {
  return runCollector("espn", fetchEspn);
}
