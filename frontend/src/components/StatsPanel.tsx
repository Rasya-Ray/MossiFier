import type { Status } from '../types'

const bars = [
  { key: 'moss_pct', label: 'Area lumut', color: 'bg-sky-400' },
  { key: 'healthy_pct', label: 'Healthy', color: 'bg-emerald-500' },
  { key: 'stressed_pct', label: 'Stressed', color: 'bg-amber-400' },
  { key: 'critical_pct', label: 'Critical', color: 'bg-rose-500' },
] as const

export default function StatsPanel({ status, now }: { status: Status | null; now: number }) {
  const s = status
  const age = s?.updated_at && now ? Math.max(0, Math.round(now / 1000 - s.updated_at)) : null
  const color = s?.status === 'critical' ? 'text-rose-400'
    : s?.status === 'stressed' ? 'text-amber-400'
    : s?.status === 'healthy' ? 'text-emerald-400' : 'text-slate-400'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
      <div>
        <p className="text-xs text-slate-400">Status keseluruhan</p>
        <p className={`text-2xl font-bold ${color}`}>{s?.status ?? 'menunggu...'}</p>
        {age !== null && <p className="text-xs text-slate-500">{age} dtk lalu</p>}
      </div>
      {bars.map(b => {
        const v = (s?.[b.key] as number | undefined) ?? 0
        return (
          <div key={b.key}>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{b.label}</span><span className="text-slate-200">{v.toFixed(0)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full ${b.color}`} style={{ width: `${Math.min(v, 100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}