import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { HistoryRow } from '../types'

export default function HistoryChart({ history }: { history: HistoryRow[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold">Riwayat</h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
            <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} unit="%" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
            <Line type="monotone" dataKey="moss_pct" name="Lumut" stroke="#38bdf8" dot={false} />
            <Line type="monotone" dataKey="healthy_pct" name="Healthy" stroke="#10b981" dot={false} />
            <Line type="monotone" dataKey="stressed_pct" name="Stressed" stroke="#fbbf24" dot={false} />
            <Line type="monotone" dataKey="critical_pct" name="Critical" stroke="#f43f5e" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}