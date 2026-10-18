import { createHash } from "node:crypto";
import { getDb } from "../queries/connection";
import { sourceHealth } from "@db/schema";
import { eq } from "drizzle-orm";
import { USER_AGENT, politeDelay, type FetchedArticle, type SourceResult } from "./types";

/** 内容去重键：标题+URL 的 sha256 前 16 位 */
export function dedupKey(title: string, url: string): string {
  return createHash("sha256").update(`${title}|${url}`).digest("hex").slice(0, 16);
}

/** 通用 RSS 抓取（rss-parser 封装，带礼貌 UA 与超时） */
export async function fetchRss(url: string, timeoutMs = 15000): Promise<FetchedArticle[]> {
  const Parser = (await import("rss-parser")).default;
  const parser = new Parser({
    timeout: timeoutMs,
    headers: { "User-Agent": USER_AGENT },
  });
  const feed = await parser.parseURL(url);
  return (feed.items ?? [])
    .filter((it) => it.title && it.link)
    .map((it) => ({
      title: it.title!.trim(),
      url: it.link!,
      publishedAt: it.isoDate ? new Date(it.isoDate) : new Date(it.pubDate ?? Date.now()),
      snippet: (it.contentSnippet ?? it.content ?? "").slice(0, 500),
      author: (it as Record<string, string>)["dc:creator"] ?? it.creator ?? undefined,
    }));
}

/** 通用 JSON 接口抓取 */
export async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 更新信源健康状态 */
export async function reportHealth(
  sourceKey: string,
  result: SourceResult | { sourceKey: string; error: string }
) {
  const db = getDb();
  const ok = !("error" in result && result.error);
  const items = "articles" in result ? result.articles.length : 0;
  const now = new Date();
  await db
    .update(sourceHealth)
    .set({
      status: ok ? ("ok" as const) : ("error" as const),
      lastRunAt: now,
      ...(ok ? { lastSuccessAt: now } : {}),
      itemsFetched: items,
      errorMessage: ok ? null : String((result as { error?: string }).error).slice(0, 500),
    })
    .where(eq(sourceHealth.sourceKey, sourceKey));
}

/** 采集器执行包装：异常不外抛，统一落健康状态 */
export async function runCollector(
  sourceKey: string,
  fetcher: () => Promise<FetchedArticle[]>
): Promise<SourceResult> {
  try {
    const articles = await fetcher();
    const result: SourceResult = { sourceKey, articles };
    await reportHealth(sourceKey, result);
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await reportHealth(sourceKey, { sourceKey, error });
    console.warn(`[collector:${sourceKey}] failed: ${error}`);
    return { sourceKey, articles: [], error };
  }
}

export { politeDelay, type FetchedArticle, type SourceResult };
