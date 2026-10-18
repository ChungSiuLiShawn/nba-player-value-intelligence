import { ChangeTag } from '../components/common'
import {
  toPlayer, useAnchorCalibrations, usePlayers, usePredictionAccuracy, useReclassify,
  useRunAnchorCalibration, useRunCollectors, useRunDailyEngine, useSourceHealth, type PlayerDto,
} from '../lib/api'
import { Bot, Database, Newspaper, Radio, CheckCircle2, Clock, AlertCircle, Play, RefreshCw, Loader2, Gauge, Target } from 'lucide-react'

const PIPELINE_STEPS = [
  { step: 'RSS / API collection', desc: 'ESPN & Shams hourly · Tier-2 twice daily' },
  { step: 'Event clustering & dedup', desc: 'bge-m3 vector similarity merges multi-source reprints' },
  { step: 'Player entity matching', desc: 'Lead-subject detection; passing mentions not scored' },
  { step: 'Bullish / bearish classification', desc: 'M1 context-aware classifier (negation windows + severity tiers)' },
  { step: 'Credibility discount', desc: 'Rumors ×0.4, confirmed news full weight' },
  { step: 'Event-level weighted aggregation', desc: 'Source weight × time decay (2-day half-life, 7-day window)' },
]

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  ok: { label: 'Healthy', cls: 'bg-emerald-50 text-emerald-600', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
  error: { label: 'Error', cls: 'bg-rose-50 text-rose-600', icon: <AlertCircle className="h-4 w-4 text-rose-500" /> },
  degraded: { label: 'Degraded', cls: 'bg-amber-50 text-amber-600', icon: <AlertCircle className="h-4 w-4 text-amber-500" /> },
  idle: { label: 'Pending', cls: 'bg-stone-100 text-stone-400', icon: <Clock className="h-4 w-4 text-stone-300" /> },
}

export default function Admin() {
  const playersQ = usePlayers()
  const healthQ = useSourceHealth()
  const accuracyQ = usePredictionAccuracy()
  const anchorsQ = useAnchorCalibrations()
  const runCollect = useRunCollectors()
  const reclassify = useReclassify()
  const runEngine = useRunDailyEngine()
  const runAnchor = useRunAnchorCalibration()
  const players = ((playersQ.data ?? []) as unknown as PlayerDto[]).map(toPlayer)

  const accuracy = accuracyQ.data
  const latestAnchor = (anchorsQ.data ?? [])[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-black text-stone-800">Pipeline Console</h1>
        <div className="flex gap-2">
          <button
            onClick={() => runCollect.mutate()}
            disabled={runCollect.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-[#bf5546]/30 bg-[#bf5546]/10 px-3 py-1.5 text-sm font-semibold text-[#bf5546] transition hover:bg-[#bf5546]/20 disabled:opacity-50"
          >
            {runCollect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Collect Now (Tier 1)
          </button>
          <button
            onClick={() => reclassify.mutate()}
            disabled={reclassify.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-600 transition hover:bg-violet-100 disabled:opacity-50"
          >
            {reclassify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reclassify + Recluster
          </button>
          <button
            onClick={() => runEngine.mutate()}
            disabled={runEngine.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {runEngine.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
            Run M0 Engine
          </button>
        </div>
      </div>

      {runEngine.data && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
          M0 engine done ({runEngine.data.index.date}): {runEngine.data.index.moved} of{' '}
          {runEngine.data.index.players} players moved · {runEngine.data.snap.written} prediction
          snapshots · backfilled {runEngine.data.back.filled}/{runEngine.data.back.due} due
        </div>
      )}
      {runAnchor.data && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2.5 text-xs text-sky-700">
          Anchor calibration saved: {runAnchor.data.quarter} · PVI vs 2K OVR Pearson r ={' '}
          {runAnchor.data.correlation} (n={runAnchor.data.sample})
        </div>
      )}

      {runCollect.data && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
          Collection done: {runCollect.data.sources.map((s) => `${s.key} ${s.fetched}${s.error ? ' (error)' : ''}`).join(' · ')}
          {' '}→ {runCollect.data.ingest.inserted} inserted (dup {runCollect.data.ingest.skippedDup} / no player {runCollect.data.ingest.skippedNoPlayer} / unclassified {runCollect.data.ingest.skippedUnclassified})
        </div>
      )}
      {reclassify.data && (
        <div className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-xs text-violet-700">
          Reclassified {reclassify.data.reclassified} of {reclassify.data.total} · reclustered {reclassify.data.clustered} · recomputed {reclassify.data.playersRecomputed} players
        </div>
      )}

      {/* Model board */}
      <section>
        <SectionTitle icon={<Bot className="h-4 w-4 text-[#bf5546]" />} title="Sentiment Engine & Model Board" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Classifier', value: 'M1', note: 'Context-aware rules · LLM slot reserved' },
            { label: 'Event clustering', value: 'bge-m3', note: 'Cosine ≥ 0.80 merge threshold' },
            {
              label: 'Direction accuracy (live)',
              value: accuracy?.resolved ? `${accuracy.accuracy}%` : '—',
              note: accuracy?.resolved
                ? `${accuracy.hits}/${accuracy.resolved} resolved 7-day forecasts`
                : `No resolved forecasts yet (${accuracy?.total ?? 0} snapshots) · baseline 66.7%`,
            },
            {
              label: 'Prediction snapshots',
              value: String(accuracy?.total ?? 0),
              note: 'Daily M0 snapshots · XGBoost after 60–90 days',
            },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-stone-400">{m.label}</div>
              <div className="mt-1 font-mono text-2xl font-black text-[#bf5546]">{m.value}</div>
              <div className="mt-1 text-[11px] text-stone-400">{m.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Source health */}
      <section>
        <SectionTitle icon={<Radio className="h-4 w-4 text-sky-500" />} title="Source Health (live)" />
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          {(healthQ.data ?? []).map((s) => {
            const meta = STATUS_META[s.status] ?? STATUS_META.idle
            return (
              <div
                key={s.sourceKey}
                className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-0"
              >
                {meta.icon}
                <div className="flex-1">
                  <div className="text-sm font-semibold text-stone-700">{s.sourceName}</div>
                  <div className="text-xs text-stone-400">
                    {s.errorMessage
                      ? `Error: ${s.errorMessage}`
                      : s.lastSuccessAt
                        ? `Last success: ${new Date(s.lastSuccessAt).toLocaleString()} · ${s.itemsFetched} items this run`
                        : 'Not run yet'}
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    s.tier === 1 ? 'bg-[#bf5546]/10 text-[#bf5546]' : 'bg-sky-50 text-sky-600'
                  }`}
                >
                  Tier {s.tier}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Anchor calibration */}
      <section>
        <SectionTitle icon={<Target className="h-4 w-4 text-[#bf5546]" />} title="Anchor Calibration (PVI vs 2K OVR)" />
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-stone-200 bg-white px-4 py-4 shadow-sm">
          <div>
            <div className="text-xs font-medium text-stone-400">Latest record</div>
            {latestAnchor ? (
              <div className="mt-1 text-sm text-stone-700">
                <span className="font-mono font-black text-[#bf5546]">r = {latestAnchor.correlation}</span>
                <span className="ml-2 text-stone-400">
                  {latestAnchor.quarter} · {latestAnchor.anchorType} ·{' '}
                  {new Date(latestAnchor.createdAt).toLocaleDateString()}
                </span>
              </div>
            ) : (
              <div className="mt-1 text-sm text-stone-400">No calibration records yet</div>
            )}
            {latestAnchor?.note && (
              <div className="mt-1 text-[11px] text-stone-400">{latestAnchor.note}</div>
            )}
          </div>
          <button
            onClick={() => runAnchor.mutate()}
            disabled={runAnchor.isPending}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-600 transition hover:bg-sky-100 disabled:opacity-50"
          >
            {runAnchor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            Calibrate Now
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline */}
        <section>
          <SectionTitle icon={<Newspaper className="h-4 w-4 text-violet-500" />} title="Sentiment Pipeline" />
          <div className="space-y-2">
            {PIPELINE_STEPS.map((p, i) => (
              <div key={p.step} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-50 font-mono text-xs font-bold text-violet-500">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-semibold text-stone-700">{p.step}</div>
                  <div className="text-xs text-stone-400">{p.desc}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Output: daily per-player net sentiment (event-level, reprints not double-counted) → feeds the value index model
            </div>
          </div>
        </section>

        {/* Player DB */}
        <section>
          <SectionTitle icon={<Database className="h-4 w-4 text-emerald-500" />} title={`Player Database (${players.length} · live)`} />
          <div className="max-h-96 overflow-auto rounded-lg border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50">
                <tr className="border-b border-stone-200 text-xs text-stone-400">
                  <th className="px-3 py-2.5 text-left font-semibold">Player</th>
                  <th className="px-3 py-2.5 text-right font-semibold">2K</th>
                  <th className="px-3 py-2.5 text-right font-semibold">PVI</th>
                  <th className="px-3 py-2.5 text-right font-semibold">7d</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="px-3 py-2 font-medium text-stone-700">
                      {p.nameEn}
                      <span className="ml-1.5 text-xs text-stone-400">{p.position}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-stone-500">{p.overallRating}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-stone-700">{p.valueIndex.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      <ChangeTag value={p.change7d} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-bold text-stone-800">{title}</h2>
    </div>
  )
}
