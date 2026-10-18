import { fetchJson, runCollector } from "./base";
import type { FetchedArticle } from "./types";

// NBA.com 官方 RSS 已下线（404）。改用 CBS Sports NBA 新闻 RSS 补位 Tier1 英文源，
// 保持 sourceKey 不变（"nba"），健康监控与权重不受影响。
const CBS_RSS = "https://www.cbssports.com/rss/headlines/nba/";

interface CbsItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
}

export async function fetchNba(): Promise<FetchedArticle[]> {
  const Parser = (await import("rss-parser")).default;
  const parser = new Parser({ timeout: 15000 });
  const feed = await parser.parseURL(CBS_RSS);
  return (feed.items ?? [])
    .filter((it: CbsItem) => it.title && it.link)
    .map((it: CbsItem) => ({
      title: it.title!.trim(),
      url: it.link!,
      publishedAt: it.isoDate ? new Date(it.isoDate) : new Date(it.pubDate ?? Date.now()),
      snippet: (it.contentSnippet ?? it.content ?? "").slice(0, 500),
    }));
}

export function runNba() {
  return runCollector("nba", fetchNba);
}
