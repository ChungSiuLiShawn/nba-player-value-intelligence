import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// 向量服务（agent-gw embeddings，bge-m3 多语言）：
// 凭证来源优先级：KIMI_API_KEY / KIMI_BASE_URL 环境变量 > ~/.kimi/agent-gw.json（开发环境）。
// 生产部署如需向量聚类，在环境变量中配置即可；不可用时自动降级为标题相似度（见 events.ts）。

interface GwConfig {
  api_key?: string;
  base_url?: string;
}

let cached: { key: string; base: string } | null | undefined;

function resolveCreds(): { key: string; base: string } | null {
  if (cached !== undefined) return cached;
  const envKey = process.env.KIMI_API_KEY;
  const envBase = process.env.KIMI_BASE_URL;
  if (envKey && envBase) {
    cached = { key: envKey, base: envBase };
    return cached;
  }
  try {
    const cfg = JSON.parse(readFileSync(`${homedir()}/.kimi/agent-gw.json`, "utf8")) as GwConfig;
    if (cfg.api_key && cfg.base_url) {
      cached = { key: cfg.api_key, base: cfg.base_url };
      return cached;
    }
  } catch {
    /* 无配置文件 */
  }
  cached = null;
  return null;
}

export function embeddingAvailable(): boolean {
  return resolveCreds() !== null;
}

/** 文本转向量；服务不可用时返回 null（调用方降级处理） */
export async function embedText(text: string): Promise<number[] | null> {
  const creds = resolveCreds();
  if (!creds) return null;
  try {
    const res = await fetch(`${creds.base}/v1/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.key}`,
      },
      body: JSON.stringify({ model: "kimi-embedding", input: text.slice(0, 1000) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding?: number[] }[] };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
