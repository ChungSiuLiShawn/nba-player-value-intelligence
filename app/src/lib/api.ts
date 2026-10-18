// API 数据访问层（Phase C）：
// 前端数据源从静态 src/data/players.ts 切换到 tRPC 真实后端。
// 所有类型从 data/players 复用，页面改动最小化；API 故障时各页面自行兜底。

import { trpc } from '../providers/trpc'
import type {
  Player, NewsItem, IndexPoint, Factor, NewsCategory, SeasonStats,
} from './types'

// —— 类型适配：DB 行 DTO → 前端 Player/NewsItem ——

export interface PlayerDto {
  id: string
  nameZh: string
  nameEn: string
  position: string
  team: string
  age: number
  overallRating: number
  avatarColor: string
  valueIndex: number
  change7d: number
  change30d: number
  predictedIndex7d: number
  riseProbability: number
  netSentiment: number
  sentiment7d: number
  hasRecentNews: boolean
  scores: { performance: number; role: number; sentiment: number; contract: number; age: number; commercial: number; physical: number }
  physical: { heightIn: number; weightLbs: number; wingspanIn: number; verticalIn: number; strengthScore: number }
  espnId: string | null
  predictionReasons: string[]
  reportSummary: string
  reportFactors: Factor[]
  reportVerdict: string
  stats: SeasonStats
}

export interface PlayerDetailDto extends PlayerDto {
  history: IndexPoint[]
  news: (NewsItem & { url?: string | null })[]
}

export interface NewsFeedItem {
  id: string
  date: string
  title: string
  url?: string | null
  source: string
  sourceTier: number
  category: NewsCategory
  sentiment: number
  confirmed: boolean
  player: PlayerDto
}

const POS_ZH: Record<string, string> = { PG: '控球后卫', SG: '得分后卫', SF: '小前锋', PF: '大前锋', C: '中锋' }

export function toPlayer(d: PlayerDto): Player {
  return {
    ...d,
    positionZh: POS_ZH[d.position] ?? d.position,
    history: [],
    news: [],
  }
}

export function toNewsItem(n: NewsFeedItem): NewsItem & { player: Player } {
  return {
    id: n.id,
    date: n.date,
    title: n.title,
    source: n.source,
    sourceTier: n.sourceTier as 1 | 2 | 3,
    category: n.category,
    sentiment: n.sentiment,
    confirmed: n.confirmed,
    player: toPlayer(n.player),
  }
}

// —— GMSC 联盟百分位（客户端从全量列表计算，与旧逻辑一致）——
export function gmScPercentileOf(p: Player, all: Player[]): number {
  const sorted = all.map((x) => x.stats.gmSc).sort((a, b) => a - b)
  let below = 0
  for (const v of sorted) if (v < p.stats.gmSc) below++
  return Math.round((below / sorted.length) * 100)
}

// —— tRPC hooks ——

export function usePlayers() {
  return trpc.players.list.useQuery(undefined, { staleTime: 60_000 })
}

export function usePlayerSearch(q: string) {
  return trpc.players.list.useQuery({ q }, { enabled: q.trim().length > 0, staleTime: 30_000 })
}

export function usePlayerDetail(slug: string) {
  return trpc.players.detail.useQuery({ slug }, { staleTime: 60_000 })
}

export type BoardKind = 'gainers' | 'losers' | 'sentiment' | 'bearish' | 'prediction'

export function useBoard(kind: BoardKind, limit = 10) {
  return trpc.players.board.useQuery({ kind, limit }, { staleTime: 60_000 })
}

export function useRecentNews(limit = 20) {
  return trpc.news.recent.useQuery({ limit }, { staleTime: 30_000 })
}

export function useSourceHealth() {
  return trpc.admin.sourceHealth.useQuery(undefined, { staleTime: 15_000, refetchInterval: 60_000 })
}

export function usePlayerCount() {
  return trpc.players.count.useQuery(undefined, { staleTime: 300_000 })
}

export function useRunCollectors() {
  const utils = trpc.useUtils()
  return trpc.admin.runCollectors.useMutation({
    onSuccess: () => {
      utils.admin.sourceHealth.invalidate()
      utils.news.recent.invalidate()
    },
  })
}

export function useReclassify() {
  const utils = trpc.useUtils()
  return trpc.admin.reclassifyAll.useMutation({
    onSuccess: () => {
      utils.players.invalidate()
      utils.news.recent.invalidate()
    },
  })
}

// —— Phase D：M0 引擎 hooks ——

export function usePredictionAccuracy() {
  return trpc.admin.predictionAccuracy.useQuery(undefined, { staleTime: 60_000 })
}

export function useAnchorCalibrations() {
  return trpc.admin.anchorCalibrations.useQuery(undefined, { staleTime: 60_000 })
}

export function useRecentPredictions() {
  return trpc.admin.recentPredictions.useQuery(undefined, { staleTime: 60_000 })
}

export function useRunDailyEngine() {
  const utils = trpc.useUtils()
  return trpc.admin.runDailyEngine.useMutation({
    onSuccess: () => {
      utils.players.invalidate()
      utils.admin.predictionAccuracy.invalidate()
    },
  })
}

export function useRunAnchorCalibration() {
  const utils = trpc.useUtils()
  return trpc.admin.runAnchorCalibration.useMutation({
    onSuccess: () => {
      utils.admin.anchorCalibrations.invalidate()
    },
  })
}
