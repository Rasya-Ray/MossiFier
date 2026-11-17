import { useState } from 'react'
import ControlPanel from './components/controlPanel.tsx'
import HistoryChart from './components/historyChart.tsx'
import LiveView from './components/liveView.tsx'
import PhotoAnalyze from './components/photoAnalyze.tsx'
import StatsPanel from './components/statsPanel.tsx'
import { useStatus } from './useStatus'
import type { Status } from './types'

function Badge({ status }: { status: Status | null }) {
  const running = !!status?.running
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className={running ? 'text-emerald-400' : 'text-slate-500'}>
        {running ? '● RUNNING' : '○ STOPPED'}
      </span>
      {status?.esp32 && <span className="text-slate-500">ESP32: {status.esp32}</span>}
    </div>
  )
}

export default function App() {
  const { status, error, now, refresh } = useStatus(1000)
  const [tab, setTab] = useState<'live' | 'photo'>('live')

  const cfg = status?.config
  // key berubah -> ControlPanel di-remount dengan nilai config terbaru dari server
  const cfgKey = cfg
    ? `${cfg.camera}|${cfg.interval}|${cfg.esp32_url}|${cfg.esp32_every}`
    : 'init'

  const tabCls = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${on ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <h1 className="font-semibold">
          Mossifier <span className="font-normal text-slate-500">Dashboard</span>
        </h1>
        <Badge status={status} />
      </header>
      <main className="grid gap-5 p-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <ControlPanel key={cfgKey} status={status} onChanged={refresh} />
          <StatsPanel status={status} now={now} />
        </div>
        <div className="space-y-5">
          <div className="flex gap-2">
            <button className={tabCls(tab === 'live')} onClick={() => setTab('live')}>Live</button>
            <button className={tabCls(tab === 'photo')} onClick={() => setTab('photo')}>Analisis foto</button>
          </div>
          {tab === 'live' ? <LiveView status={status} /> : <PhotoAnalyze />}
          <HistoryChart history={status?.history ?? []} />
          {error && <p className="text-sm text-rose-400">API error: {error}</p>}
        </div>
      </main>
    </div>
  )
}