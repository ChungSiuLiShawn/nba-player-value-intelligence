import { useState } from 'react'
import { toPlayer, useBoard, type BoardKind, type PlayerDto } from '../lib/api'
import { Avatar, ChangeTag } from '../components/common'
import { teamEn } from '../lib/types'
import { Loader2 } from 'lucide-react'

type Tab = 'gainers' | 'losers' | 'sentiment' | 'warning' | 'prediction'

const TABS: { key: Tab; label: string }[] = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'sentiment', label: 'Buzz' },
  { key: 'warning', label: 'Bearish Alerts' },
  { key: 'prediction', label: 'AI Bullish' },
]

const TAB_TO_KIND: Record<Tab, BoardKind> = {
  gainers: 'gainers',
  losers: 'losers',
  sentiment: 'sentiment',
  warning: 'bearish',
  prediction: 'prediction',
}

export default function Rankings({ openPlayer }: { openPlayer: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('gainers')
  const boardQ = useBoard(TAB_TO_KIND[tab], 200)
  const list = ((boardQ.data ?? []) as unknown as PlayerDto[]).map(toPlayer)

  const rightHeader =
    tab === 'sentiment' || tab === 'warning'
      ? '7d Buzz'
      : tab === 'prediction'
        ? 'Rise Prob.'
        : 'Pred. 7d PVI'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-black text-stone-800">Player Leaderboards</h1>
        <div className="flex gap-1 rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.key
                  ? 'bg-[#bf5546]/10 font-bold text-[#bf5546]'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {boardQ.isLoading && (
        <div className="flex items-center justify-center py-16 text-stone-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading board…
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-400">
              <th className="px-4 py-3 text-left font-semibold">#</th>
              <th className="px-4 py-3 text-left font-semibold">Player</th>
              <th className="px-4 py-3 text-left font-semibold">Pos</th>
              <th className="px-4 py-3 text-right font-semibold">2K OVR</th>
              <th className="px-4 py-3 text-right font-semibold">PVI</th>
              <th className="px-4 py-3 text-right font-semibold">7d</th>
              <th className="px-4 py-3 text-right font-semibold">30d</th>
              <th className="px-4 py-3 text-right font-semibold">{rightHeader}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => (
              <tr
                key={p.id}
                onClick={() => openPlayer(p.id)}
                className="cursor-pointer border-b border-stone-100 transition hover:bg-[#f6f2e9]/60"
              >
                <td className="px-4 py-3">
                  <span
                    className={`font-mono font-bold ${i < 3 ? 'text-[#bf5546]' : 'text-stone-300'}`}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar player={p} size="md" />
                    <div>
                      <div className="font-semibold text-stone-800">{p.nameEn}</div>
                      <div className="text-xs text-stone-400">{teamEn(p.team)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-stone-500">{p.position}</td>
                <td className="px-4 py-3 text-right font-mono text-stone-500">
                  {p.overallRating}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-stone-800">
                  {p.valueIndex.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right">
                  <ChangeTag value={p.change7d} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ChangeTag value={p.change30d} />
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">
                  {tab === 'sentiment' || tab === 'warning' ? (
                    <span className={p.sentiment7d >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {p.sentiment7d >= 0 ? '+' : ''}
                      {p.sentiment7d}
                    </span>
                  ) : tab === 'prediction' ? (
                    <span className="text-[#bf5546]">{p.riseProbability}%</span>
                  ) : (
                    <span className="text-[#bf5546]">{p.predictedIndex7d.toFixed(1)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
