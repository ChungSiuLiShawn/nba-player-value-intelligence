import { Avatar, ChangeTag, NewsCard } from '../components/common'
import type { Player } from '../lib/types'
import {
  toNewsItem, toPlayer, useBoard, usePlayers, usePlayerSearch, useRecentNews, type PlayerDto,
} from '../lib/api'
import { teamEn } from '../lib/types'
import { useState } from 'react'
import { Search, Flame, TrendingDown, Eye, Newspaper, Loader2, Activity, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  q: string
  setQ: (v: string) => void
  openPlayer: (id: string) => void
}

export default function Home({ q, setQ, openPlayer }: Props) {
  const allQ = usePlayers()
  const searchQ = usePlayerSearch(q)
  const newsQ = useRecentNews(8)
  const gainersQ = useBoard('gainers', 25)
  const sentimentQ = useBoard('sentiment', 25)
  const bearishQ = useBoard('bearish', 25)
  const predictionQ = useBoard('prediction', 3)

  const players: Player[] = (allQ.data ?? []).map((d) => toPlayer(d as PlayerDto))
  const results: Player[] = (searchQ.data ?? []).map((d) => toPlayer(d as PlayerDto))

  const upCount = players.filter((p) => p.change7d > 0).length
  const downCount = players.filter((p) => p.change7d < 0).length
  const todayNews = (newsQ.data ?? []).map(toNewsItem).slice(0, 6)

  const boardPlayers = (q_: { data?: unknown }) =>
    ((q_.data ?? []) as PlayerDto[]).map((d) => toPlayer(d))

  if (allQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-stone-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Connecting to live database…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search hero */}
      <section className="relative mx-auto max-w-2xl pt-4 text-center">
        <h1 className="text-2xl font-black tracking-tight text-stone-800">
          Read the news. <span className="text-[#bf5546]">Front-run the market.</span>
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Search any NBA player — e.g. Nikola Jokic, Stephen Curry, Victor Wembanyama
        </p>
        <div className="relative mt-5">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search players…"
            className="w-full rounded-lg border border-stone-300 bg-white py-3.5 pl-12 pr-4 text-stone-800 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-[#bf5546]/60 focus:ring-2 focus:ring-[#bf5546]/15"
          />
          {q && (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-stone-200 bg-white text-left shadow-xl">
              {results.length === 0 ? (
                <div className="px-4 py-3 text-sm text-stone-400">No players match “{q}”</div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openPlayer(p.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 transition hover:bg-stone-50"
                  >
                    <Avatar player={p} size="md" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-stone-800">{p.nameEn}</div>
                      <div className="text-xs text-stone-400">
                        {p.position} · {teamEn(p.team)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-stone-800">
                        {p.valueIndex.toFixed(1)}
                      </div>
                      <ChangeTag value={p.change7d} />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {/* Market overview */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Players Tracked" value={String(players.length)} sub="All 30 NBA teams" />
        <StatCard
          label="Index Rising"
          value={String(upCount)}
          sub="7-day PVI gainers"
          accent="text-emerald-600"
        />
        <StatCard
          label="Index Falling"
          value={String(downCount)}
          sub="7-day PVI losers"
          accent="text-rose-600"
        />
        <StatCard
          label="Sentiment Engine"
          value="Live"
          sub="ESPN / Shams hourly crawl"
          accent="text-[#bf5546]"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard
          title="Top Gainers"
          icon={<Flame className="h-4 w-4 text-[#bf5546]" />}
          players={boardPlayers(gainersQ)}
          metric="change7d"
          openPlayer={openPlayer}
        />
        <RankCard
          title="Hottest Buzz"
          icon={<Activity className="h-4 w-4 text-emerald-600" />}
          players={boardPlayers(sentimentQ)}
          metric="sentiment"
          openPlayer={openPlayer}
        />
        <RankCard
          title="Bearish Alerts"
          icon={<TrendingDown className="h-4 w-4 text-rose-600" />}
          players={boardPlayers(bearishQ)}
          metric="sentiment"
          openPlayer={openPlayer}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard
          title="AI Watchlist"
          icon={<Eye className="h-4 w-4 text-[#bf5546]" />}
          players={boardPlayers(predictionQ)}
          metric="riseProbability"
          openPlayer={openPlayer}
        />
        {/* News feed */}
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
            <Newspaper className="h-4 w-4 text-[#bf5546]" />
            <span className="text-sm font-bold text-stone-800">
              Latest Signals (auto-classified)
            </span>
            <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
              LIVE DB
            </span>
          </div>
          <div className="space-y-2.5 p-4">
            {todayNews.map((item) => (
              <button
                key={item.id}
                onClick={() => openPlayer(item.player.id)}
                className="block w-full text-left transition hover:opacity-75"
              >
                <NewsCard item={item} player={item.player} />
              </button>
            ))}
            {todayNews.length === 0 && (
              <div className="py-6 text-center text-sm text-stone-400">
                No news yet — waiting for the next collector run.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-stone-400">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-black ${accent ?? 'text-stone-800'}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-stone-400">{sub}</div>
    </div>
  )
}

function RankCard({
  title,
  icon,
  players,
  metric,
  openPlayer,
}: {
  title: string
  icon: React.ReactNode
  players: Player[]
  metric: 'change7d' | 'riseProbability' | 'sentiment'
  openPlayer: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? players : players.slice(0, 5)
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
        {icon}
        <span className="text-sm font-bold text-stone-800">{title}</span>
        {players.length > 5 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-stone-400 transition hover:bg-stone-50 hover:text-[#bf5546]"
          >
            {expanded ? (
              <>
                Collapse <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                All {players.length} <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        )}
      </div>
      <div>
        {visible.map((p, i) => (
          <button
            key={p.id}
            onClick={() => openPlayer(p.id)}
            className="flex w-full items-center gap-3 px-4 py-2.5 transition hover:bg-stone-50"
          >
            <span
              className={`w-4 font-mono text-sm font-bold ${
                i === 0 ? 'text-[#bf5546]' : 'text-stone-300'
              }`}
            >
              {i + 1}
            </span>
            <Avatar player={p} size="md" />
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-stone-800">{p.nameEn}</div>
              <div className="font-mono text-xs text-stone-400">
                PVI {p.valueIndex.toFixed(1)}
              </div>
            </div>
            {metric === 'change7d' ? (
              <ChangeTag value={p.change7d} />
            ) : metric === 'riseProbability' ? (
              <span className="font-mono text-sm font-bold text-[#bf5546]">
                {p.riseProbability}%
              </span>
            ) : (
              <span
                className={`font-mono text-sm font-bold ${
                  p.sentiment7d > 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {p.sentiment7d > 0 ? '+' : ''}
                {p.sentiment7d}
              </span>
            )}
          </button>
        ))}
        {players.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-stone-300">No qualifying players</div>
        )}
      </div>
      {!expanded && players.length > 5 && (
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1 border-t border-stone-200 py-2 text-xs font-semibold text-stone-400 transition hover:bg-stone-50 hover:text-[#bf5546]"
        >
          Show all {players.length} <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
