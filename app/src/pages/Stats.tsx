import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toPlayer, usePlayers, type PlayerDto } from '../lib/api'
import { leaderStatVal, statLeader, teamEn, type LeaderKey, type Player } from '../lib/types'
import { Avatar } from '../components/common'
import { ArrowDown, ArrowUp, BarChart3, Loader2 } from 'lucide-react'

type ColKey = 'gp' | 'min' | 'pts' | 'ast' | 'reb' | 'stl' | 'blk' | 'tov' | 'fgPct' | 'p3Pct' | 'ftPct' | 'tsPct' | 'gmSc'

const COLS: { key: ColKey; label: string }[] = [
  { key: 'gp', label: 'GP' },
  { key: 'min', label: 'MIN' },
  { key: 'pts', label: 'PTS' },
  { key: 'ast', label: 'AST' },
  { key: 'reb', label: 'REB' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'tov', label: 'TOV' },
  { key: 'fgPct', label: 'FG%' },
  { key: 'p3Pct', label: '3P%' },
  { key: 'ftPct', label: 'FT%' },
  { key: 'tsPct', label: 'TS%' },
  { key: 'gmSc', label: 'GMSC' },
]

const PCT_KEYS: ColKey[] = ['fgPct', 'p3Pct', 'ftPct', 'tsPct']

function colVal(p: Player, key: ColKey): number {
  const s = p.stats
  switch (key) {
    case 'reb':
      return s.oreb + s.dreb
    case 'fgPct':
      return s.fga > 0 ? s.fgm / s.fga : 0
    case 'p3Pct':
      return s.p3a > 0 ? s.p3m / s.p3a : 0
    case 'ftPct':
      return s.fta > 0 ? s.ftm / s.fta : 0
    default:
      return s[key]
  }
}

function fmtCol(p: Player, key: ColKey): string {
  const v = colVal(p, key)
  if (PCT_KEYS.includes(key)) return (v * 100).toFixed(1) + '%'
  return v.toFixed(key === 'gp' ? 0 : 1)
}

const LEADER_DEFS: { key: LeaderKey; label: string; accent: string }[] = [
  { key: 'pts', label: 'Scoring Leader', accent: 'border-l-amber-400' },
  { key: 'ast', label: 'Assist Leader', accent: 'border-l-orange-400' },
  { key: 'reb', label: 'Rebound Leader', accent: 'border-l-emerald-400' },
  { key: 'stl', label: 'Steal Leader', accent: 'border-l-violet-400' },
]

export default function Stats() {
  const navigate = useNavigate()
  const [minFilter, setMinFilter] = useState(500)
  const [sortKey, setSortKey] = useState<ColKey>('gmSc')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const allQ = usePlayers()
  const PLAYERS = useMemo(
    () => ((allQ.data ?? []) as unknown as PlayerDto[]).map(toPlayer),
    [allQ.data],
  )

  const rows = useMemo(() => {
    const filtered = PLAYERS.filter((p) => p.stats.gp * p.stats.min >= minFilter)
    return filtered.sort((a, b) => (colVal(b, sortKey) - colVal(a, sortKey)) * -sortDir)
  }, [PLAYERS, minFilter, sortKey, sortDir])

  // league averages over the filtered pool — for green/red cell coloring
  const leagueAvg = useMemo(() => {
    const pool = rows.length > 0 ? rows : PLAYERS
    const avg = {} as Record<ColKey, number>
    for (const c of COLS) {
      avg[c.key] = pool.length
        ? pool.reduce((sum, p) => sum + colVal(p, c.key), 0) / pool.length
        : 0
    }
    return avg
  }, [rows, PLAYERS])

  const leaders = useMemo(() => {
    const pool = rows.length > 0 ? rows : PLAYERS
    return LEADER_DEFS.map((d) => ({ ...d, player: statLeader(d.key, pool) }))
  }, [rows, PLAYERS])

  const toggleSort = (key: ColKey) => {
    if (key === sortKey) setSortDir((d) => (d === -1 ? 1 : -1))
    else {
      setSortKey(key)
      setSortDir(-1)
    }
  }

  const cellColor = (p: Player, key: ColKey): string => {
    if (key === 'gp' || key === 'min') return 'text-stone-500'
    const v = colVal(p, key)
    const avg = leagueAvg[key]
    // TOV: lower is better
    const good = key === 'tov' ? v < avg : v > avg
    const diff = Math.abs(v - avg)
    if (diff / (Math.abs(avg) || 1) < 0.05) return 'text-stone-500' // near average → neutral
    return good ? 'text-emerald-600 font-semibold' : 'text-rose-500'
  }

  if (allQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-stone-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading season stats…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page head */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-stone-800">
            <BarChart3 className="h-5 w-5 text-[#bf5546]" />
            Season Stats · 2025-26
          </h1>
          <p className="mt-1 text-xs text-stone-400">
            Fundamentals track: 15 per-game counting stats + TS% / GMSC efficiency
            (Hollinger method)
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-2.5 shadow-sm">
          <span className="whitespace-nowrap text-xs font-medium text-stone-500">
            Min. total minutes
          </span>
          <input
            type="range"
            min={0}
            max={2000}
            step={100}
            value={minFilter}
            onChange={(e) => setMinFilter(Number(e.target.value))}
            className="w-40 accent-[#bf5546]"
          />
          <span className="w-12 text-right font-mono text-sm font-bold text-[#bf5546]">
            {minFilter}
          </span>
        </div>
      </div>

      {/* Leader cards — colored left accent */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {leaders.map(({ key, label, accent, player }) => (
          <button
            key={key}
            onClick={() => navigate(`/player/${player.id}`)}
            className={`rounded-lg border border-l-4 border-stone-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md ${accent}`}
          >
            <div className="text-xs font-medium text-stone-400">{label}</div>
            <div className="mt-1 font-mono text-3xl font-black text-stone-800">
              {leaderStatVal(player, key).toFixed(1)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Avatar player={player} size="md" />
              <div>
                <div className="text-sm font-bold text-stone-800">{player.nameEn}</div>
                <div className="text-[10px] text-stone-400">
                  {teamEn(player.team)} · {player.position}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Sortable table */}
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-400">
                <th className="px-3 py-3 text-left font-semibold">#</th>
                <th className="px-3 py-3 text-left font-semibold">Player</th>
                <th className="px-3 py-3 text-left font-semibold">Team</th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`cursor-pointer select-none px-3 py-3 text-right font-semibold transition hover:text-stone-600 ${
                      sortKey === c.key ? 'text-[#bf5546]' : c.key === 'gmSc' ? 'text-[#bf5546]/70' : ''
                    }`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {c.label}
                      {sortKey === c.key &&
                        (sortDir === -1 ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/player/${p.id}`)}
                  className="cursor-pointer border-b border-stone-100 transition hover:bg-[#f6f2e9]/60"
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-stone-300">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar player={p} size="md" />
                      <div className="font-semibold text-stone-800">{p.nameEn}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-stone-500">{teamEn(p.team)}</td>
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 text-right font-mono text-xs ${
                        c.key === 'gmSc'
                          ? 'font-black text-[#bf5546]'
                          : c.key === 'tsPct'
                            ? 'font-semibold text-sky-600'
                            : cellColor(p, c.key)
                      }`}
                    >
                      {fmtCol(p, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-stone-200 px-4 py-3 text-[11px] leading-relaxed text-stone-400">
          GMSC = Hollinger Game Score = PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA−FTM) + 0.7·OREB +
          0.3·DREB + STL + 0.7·AST + 0.7·BLK − 0.4·PF − TOV · TS% = PTS ÷ (2 × (FGA + 0.44 ×
          FTA)). Cell colors mark values above (green) / below (red) the filtered league average.
          {rows.length} players shown · click a row for player detail.
        </div>
      </div>
    </div>
  )
}
