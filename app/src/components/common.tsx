import { useState } from 'react'
import type { NewsItem, Player } from '../lib/types'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { BULLISH_CATS, catEn, teamEn } from '../lib/types'

export function Avatar({ player, size = 'md' }: { player: Player; size?: 'sm' | 'md' | 'lg' }) {
  const cls =
    size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
  const parts = player.nameEn.trim().split(/\s+/)
  const initial = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  const [imgFailed, setImgFailed] = useState(false)
  const headshot = player.espnId
    ? `https://a.espncdn.com/i/headshots/nba/players/full/${player.espnId}.png`
    : null
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold uppercase text-white ${cls}`}
      style={{ backgroundColor: player.avatarColor }}
    >
      {initial}
      {headshot && !imgFailed && (
        <img
          src={headshot}
          alt={player.nameEn}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full rounded-full bg-[#e8e2d4] object-cover object-top"
        />
      )}
    </div>
  )
}

export function ChangeTag({ value, suffix = '' }: { value: number; suffix?: string }) {
  const up = value > 0
  const zero = value === 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono font-semibold ${
        zero ? 'text-stone-400' : up ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      {zero ? <Minus className="h-3 w-3" /> : up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}

export function ProbabilityBar({ value }: { value: number }) {
  const color = value >= 65 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-sm font-semibold text-stone-700">{value}%</span>
    </div>
  )
}

const TIER_LABEL: Record<number, { text: string; cls: string }> = {
  1: { text: 'Top Tier', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  2: { text: 'Major', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  3: { text: 'Indie', cls: 'bg-stone-100 text-stone-500 border-stone-200' },
}

export function TierBadge({ tier }: { tier: number }) {
  const t = TIER_LABEL[tier] ?? TIER_LABEL[3]
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${t.cls}`}>{t.text}</span>
}

export function NewsCard({ item, player }: { item: NewsItem; player?: Player }) {
  const bullish = BULLISH_CATS.includes(item.category)
  const scoreColor = item.sentiment > 0.2 ? 'text-emerald-600' : item.sentiment < -0.2 ? 'text-rose-600' : 'text-stone-400'
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            bullish ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {bullish ? 'Bullish' : 'Bearish'} · {catEn(item.category)}
        </span>
        <TierBadge tier={item.sourceTier} />
        {!item.confirmed && (
          <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-600">
            Rumor
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-stone-400">{item.date}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-stone-700">{item.title}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
        <span>
          {item.source}
          {player && <span className="ml-2 text-stone-400">· {player.nameEn} · {teamEn(player.team)}</span>}
        </span>
        <span className={`font-mono font-semibold ${scoreColor}`}>
          lean {item.sentiment > 0 ? '+' : ''}
          {item.sentiment.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
