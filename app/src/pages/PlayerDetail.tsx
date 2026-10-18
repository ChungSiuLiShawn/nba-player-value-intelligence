import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  gmScPercentileOf, toPlayer, usePlayerDetail, usePlayers,
  type PlayerDetailDto, type PlayerDto,
} from '../lib/api'
import type { Player } from '../lib/types'
import { teamEn, POSITION_EN } from '../lib/types'
import { Avatar, ChangeTag, NewsCard, ProbabilityBar } from '../components/common'
import {
  Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ArrowLeft, BrainCircuit, AlertTriangle, Loader2 } from 'lucide-react'

type Range = 7 | 30 | 90

export default function PlayerDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const detailQ = usePlayerDetail(id)
  const allQ = usePlayers()
  const [range, setRange] = useState<Range>(30)

  const player = useMemo(() => {
    if (!detailQ.data) return null
    const d = detailQ.data as unknown as PlayerDetailDto
    const base = toPlayer(d)
    return {
      ...base,
      history: d.history,
      news: d.news.map((n) => ({ ...n, sourceTier: n.sourceTier as 1 | 2 | 3 })),
    } as Player
  }, [detailQ.data])

  const gmscPct = useMemo(() => {
    if (!player || !allQ.data) return 0
    const all = (allQ.data as unknown as PlayerDto[]).map(toPlayer)
    return gmScPercentileOf(player, all)
  }, [player, allQ.data])

  const chartData = useMemo(() => {
    if (!player) return []
    return player.history.slice(-range).map((p) => ({ ...p, label: p.date.slice(5) }))
  }, [player, range])

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-stone-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading player…
      </div>
    )
  }

  if (!player) {
    return (
      <div className="py-20 text-center text-stone-400">
        Player not found
        <button onClick={() => navigate('/')} className="ml-3 text-[#bf5546] underline">
          Back to home
        </button>
      </div>
    )
  }

  const rising = player.change7d > 0
  const radarData = [
    { dim: 'Performance', value: player.scores.performance },
    { dim: 'Role', value: player.scores.role },
    { dim: 'Sentiment', value: player.scores.sentiment },
    { dim: 'Contract', value: player.scores.contract },
    { dim: 'Age Curve', value: player.scores.age },
    { dim: 'Brand', value: player.scores.commercial },
    { dim: 'Physical', value: player.scores.physical },
  ]
  const events = chartData.filter((d) => d.event)
  const bullishNews = player.news.filter((x) => x.sentiment > 0)
  const bearishNews = player.news.filter((x) => x.sentiment < 0)

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-stone-400 transition hover:text-[#bf5546]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to search
      </button>

      {/* Header: identity + index */}
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar player={player} size="lg" />
          <div className="min-w-[200px]">
            <h1 className="text-xl font-black text-stone-800">{player.nameEn}</h1>
            <div className="mt-0.5 text-sm text-stone-400">
              {POSITION_EN[player.position] ?? player.position} ({player.position}) ·{' '}
              {teamEn(player.team)} · Age {player.age} · 2K OVR {player.overallRating}
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-end justify-end gap-8">
            <Metric label="Value Index (PVI)" value={player.valueIndex.toFixed(1)} big />
            <Metric label="7 Days" value={<ChangeTag value={player.change7d} />} />
            <Metric label="30 Days" value={<ChangeTag value={player.change30d} />} />
            <Metric
              label="Net Sentiment"
              value={
                <span
                  className={`font-mono font-semibold ${player.netSentiment >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                >
                  {player.netSentiment >= 0 ? '+' : ''}
                  {player.netSentiment}
                </span>
              }
            />
            <Metric
              label="Trend"
              value={
                !player.hasRecentNews ? (
                  <span className="font-semibold text-stone-400">Flat</span>
                ) : (
                  <span className={`font-semibold ${rising ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {rising ? 'Bullish' : 'Bearish'}
                  </span>
                )
              }
            />
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Chart */}
        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-800">Value Index Trend</h2>
            <div className="flex gap-1">
              {([7, 30, 90] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${
                    range === r
                      ? 'bg-[#bf5546]/10 font-bold text-[#bf5546]'
                      : 'text-stone-400 hover:bg-stone-100'
                  }`}
                >
                  {r}D
                </button>
              ))}
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                <defs>
                  <linearGradient id="idxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={rising ? '#10b981' : '#f43f5e'} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={rising ? '#10b981' : '#f43f5e'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e7e0d3" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#a8a29e', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#e7e0d3' }}
                  minTickGap={30}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: '#a8a29e', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e7e5e4',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#78716c' }}
                  formatter={(value) => [Number(value).toFixed(1), 'PVI']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={rising ? '#10b981' : '#f43f5e'}
                  strokeWidth={2}
                  fill="url(#idxGrad)"
                  isAnimationActive={false}
                />
                {events.map((e) => (
                  <ReferenceDot
                    key={e.date}
                    x={e.label}
                    y={e.value}
                    r={5}
                    fill="#bf5546"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {events.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-stone-200 pt-3">
              {events.map((e) => (
                <div key={e.date} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full bg-[#bf5546]" />
                  <span className="font-mono text-stone-400">{e.date}</span>
                  <span className="text-stone-600">{e.event}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI prediction + radar */}
        <section className="flex flex-col gap-5">
          <div className="rounded-lg border border-[#bf5546]/25 bg-gradient-to-b from-[#bf5546]/5 to-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[#bf5546]" />
              <h2 className="text-sm font-bold text-[#bf5546]">AI 7-Day Forecast</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-stone-400">Predicted PVI</div>
                <div className="mt-1 font-mono text-2xl font-black text-[#bf5546]">
                  {player.predictedIndex7d.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400">Rise Probability</div>
                <div className="mt-2">
                  <ProbabilityBar value={player.riseProbability} />
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-[#bf5546]/15 pt-3">
              <div className="text-xs font-semibold text-stone-500">Why this forecast</div>
              <ol className="mt-2 space-y-1.5">
                {player.predictionReasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs text-stone-600">
                    <span className="font-mono font-bold text-[#bf5546]">{i + 1}.</span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-stone-800">Seven-Dimension Score</h2>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e7e0d3" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: '#78716c', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    dataKey="value"
                    stroke="#bf5546"
                    fill="#bf5546"
                    fillOpacity={0.2}
                    isAnimationActive={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-xs">
              <span className="text-stone-500">7-day net buzz</span>
              <span
                className={`font-mono font-bold ${player.sentiment7d >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {player.sentiment7d >= 0 ? '+' : ''}
                {player.sentiment7d}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Season fundamentals */}
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-800">Season Fundamentals · 2025-26</h2>
          <span className="text-[10px] text-stone-400">
            Fundamentals track → “Performance” dimension · GMSC + TS% method
          </span>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-3">
          {[
            { label: 'PTS', value: player.stats.pts.toFixed(1) },
            { label: 'REB', value: (player.stats.oreb + player.stats.dreb).toFixed(1) },
            { label: 'AST', value: player.stats.ast.toFixed(1) },
            { label: 'STL', value: player.stats.stl.toFixed(1) },
            { label: 'BLK', value: player.stats.blk.toFixed(1) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
              <div className="font-mono text-lg font-black text-stone-800">{s.value}</div>
              <div className="mt-0.5 text-[10px] font-semibold text-stone-400">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: 'FG%', value: ((player.stats.fgm / player.stats.fga) * 100).toFixed(1) + '%' },
            {
              label: '3P%',
              value:
                (player.stats.p3a > 0 ? (player.stats.p3m / player.stats.p3a) * 100 : 0).toFixed(1) +
                '%',
            },
            { label: 'FT%', value: ((player.stats.ftm / player.stats.fta) * 100).toFixed(1) + '%' },
            {
              label: 'TS%',
              value: (player.stats.tsPct * 100).toFixed(1) + '%',
              hl: 'text-sky-600',
            },
            { label: 'GMSC', value: player.stats.gmSc.toFixed(1), hl: 'text-[#bf5546]' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-stone-200 px-3 py-2 text-center"
            >
              <div className={`font-mono text-base font-black ${s.hl ?? 'text-stone-700'}`}>
                {s.value}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold text-stone-400">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2.5">
          <span className="whitespace-nowrap text-xs text-stone-500">GMSC league percentile</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-[#bf5546]" style={{ width: `${gmscPct}%` }} />
          </div>
          <span className="font-mono text-sm font-black text-[#bf5546]">{gmscPct}%</span>
          <span className="hidden whitespace-nowrap text-[10px] text-stone-400 lg:inline">
            outranks {gmscPct}% of the league · {player.stats.gp} GP ·{' '}
            {player.stats.min.toFixed(1)} MPG
          </span>
        </div>
      </section>

      {/* Physical profile */}
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-800">Physical Profile</h2>
          <span className="text-[10px] text-stone-400">
            Physical track → “Physical” dimension · height / wingspan / vertical / strength model
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: 'HEIGHT', value: fmtIn(player.physical.heightIn) },
            { label: 'WINGSPAN', value: fmtIn(player.physical.wingspanIn) },
            { label: 'WEIGHT', value: `${Math.round(player.physical.weightLbs)} lbs` },
            { label: 'VERTICAL', value: `${player.physical.verticalIn.toFixed(1)}"` },
            { label: 'STRENGTH', value: `${player.physical.strengthScore}`, hl: 'text-sky-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-stone-50 px-3 py-2.5 text-center">
              <div className={`font-mono text-lg font-black ${s.hl ?? 'text-stone-800'}`}>
                {s.value}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold text-stone-400">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2.5">
          <span className="whitespace-nowrap text-xs text-stone-500">Physical score</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-sky-600"
              style={{ width: `${player.scores.physical}%` }}
            />
          </div>
          <span className="font-mono text-sm font-black text-sky-600">
            {player.scores.physical}
          </span>
          <span className="hidden whitespace-nowrap text-[10px] text-stone-400 lg:inline">
            position-adjusted (ape index / vertical norms by position)
          </span>
        </div>
      </section>

      {/* News feed */}
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-stone-800">
          News Feed (last 7 days: {bullishNews.length} bullish / {bearishNews.length} bearish)
        </h2>
        {player.news.length === 0 ? (
          <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-400">
            No news in the last 7 days — sentiment stays neutral and the index is untouched.
          </div>
        ) : (
          <div className="mt-4 grid gap-2.5 lg:grid-cols-2">
            {player.news.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Attribution report */}
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-stone-800">
          AI Attribution: why is {player.nameEn}{' '}
          {!player.hasRecentNews ? 'flat lately' : rising ? 'trending up' : 'trending down'}?
        </h2>
        <p className="mt-2 text-sm text-stone-500">{player.reportSummary}</p>
        <div className="mt-4 space-y-2.5">
          {player.reportFactors.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3"
            >
              <span className="font-mono text-lg font-black text-stone-300">
                {['1', '2', '3'][i]}
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-stone-700">{f.name}</div>
                <div className="text-xs text-stone-400">{f.change}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className={`h-full rounded-full ${
                      f.direction === 'up'
                        ? 'bg-emerald-500'
                        : f.direction === 'down'
                          ? 'bg-rose-500'
                          : 'bg-stone-400'
                    }`}
                    style={{ width: `${f.contribution}%` }}
                  />
                </div>
                <span
                  className={`w-16 text-right font-mono text-xs font-bold ${
                    f.direction === 'up'
                      ? 'text-emerald-600'
                      : f.direction === 'down'
                        ? 'text-rose-600'
                        : 'text-stone-400'
                  }`}
                >
                  {f.direction === 'up' ? '+' : f.direction === 'down' ? '−' : '±'}
                  {f.contribution}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#bf5546]/20 bg-[#bf5546]/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#bf5546]" />
          <span className="text-sm text-stone-600">{player.reportVerdict}</span>
        </div>
      </section>
    </div>
  )
}

/** 英寸 → 6'7" 格式 */
function fmtIn(inches: number): string {
  if (!inches) return '—'
  const ft = Math.floor(inches / 12)
  const rest = Math.round(inches - ft * 12)
  return `${ft}'${rest}"`
}

function Metric({
  label,
  value,
  big,
}: {
  label: string
  value: React.ReactNode
  big?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-stone-400">{label}</div>
      <div className={`mt-1 font-mono font-black text-stone-800 ${big ? 'text-3xl' : 'text-lg'}`}>
        {value}
      </div>
    </div>
  )
}
