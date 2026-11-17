import { useState } from 'react'
import { api } from '../api'
import type { Camera, Status } from '../types'

export default function ControlPanel({ status, onChanged }:
  { status: Status | null; onChanged: () => void }) {
  const running = !!status?.running
  const cfg = status?.config
  const [cameras, setCameras] = useState<Camera[]>([])
  const [scanning, setScanning] = useState(false)
  // nilai awal dari server; disinkronkan ulang lewat `key` di App.tsx
  const [camera, setCamera] = useState(cfg?.camera ?? '0')
  const [every, setEvery] = useState(cfg?.interval ?? 3)
  const [espUrl, setEspUrl] = useState(cfg?.esp32_url ?? '')
  const [espEvery, setEspEvery] = useState(cfg?.esp32_every ?? 10)
  const [test, setTest] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  async function scan() {
    setScanning(true)
    try { setCameras((await api.cameras()).cameras) } finally { setScanning(false) }
  }

  async function toggle() {
    setBusy(true)
    try {
      if (running) await api.stop()
      else await api.start({ camera, interval: every, esp32_url: espUrl, esp32_every: espEvery })
      onChanged()
    } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }

  async function apply() {
    try { await api.patch({ interval: every, esp32_url: espUrl, esp32_every: espEvery }); onChanged() }
    catch (e) { alert((e as Error).message) }
  }

  async function testEsp() {
    try { setTest((await api.testEsp(espUrl)).steps.map(s => `${s.ok ? '✅' : '❌'} ${s.msg}`)) }
    catch (e) { setTest([`❌ ${(e as Error).message}`]) }
  }

  const input = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm'
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Kontrol</h2>
        <span className={running ? 'text-emerald-400 text-sm' : 'text-slate-500 text-sm'}>
          {running ? '● berjalan' : '○ berhenti'}
        </span>
      </div>

      <label className="block text-xs text-slate-400">Kamera
        <div className="mt-1 flex gap-2">
          <select value={camera} onChange={e => setCamera(e.target.value)} className={input}>
            {(cameras.length ? cameras : [{ index: Number(camera), label: `Kamera ${camera}` }])
              .map(c => <option key={c.index} value={c.index}>{c.label}</option>)}
          </select>
          <button onClick={scan} disabled={scanning}
            className="rounded-lg bg-slate-700 px-3 text-xs hover:bg-slate-600 disabled:opacity-50">
            {scanning ? '...' : 'Scan'}
          </button>
        </div>
      </label>

      <label className="block text-xs text-slate-400">
        Jendela hitung: <b className="text-slate-200">{every} dtk</b>
        <input type="range" min={1} max={15} step={0.5} value={every}
          onChange={e => setEvery(Number(e.target.value))} className="w-full accent-emerald-500" />
      </label>

      <label className="block text-xs text-slate-400">IP / URL ESP32
        <input value={espUrl} onChange={e => setEspUrl(e.target.value)}
          placeholder="http://192.168.1.10/vision" className={`${input} mt-1`} />
      </label>

      <label className="block text-xs text-slate-400">
        Kirim ke ESP32 tiap: <b className="text-slate-200">{espEvery} dtk</b>
        <input type="range" min={2} max={60} step={1} value={espEvery}
          onChange={e => setEspEvery(Number(e.target.value))} className="w-full accent-emerald-500" />
      </label>

      <div className="flex gap-2">
        <button onClick={toggle} disabled={busy}
          className={`flex-1 rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${
            running ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
          {busy ? '...' : running ? 'Stop' : 'Start'}
        </button>
        <button onClick={apply}
          className="rounded-lg border border-slate-700 px-3 text-sm hover:bg-slate-800">
          Terapkan
        </button>
      </div>

      <button onClick={testEsp} className="w-full rounded-lg border border-slate-700 py-2 text-xs hover:bg-slate-800">
        Tes koneksi ESP32
      </button>
      {test && <div className="space-y-1 text-xs text-slate-300">
        {test.map((t, i) => <p key={i}>{t}</p>)}
      </div>}
    </div>
  )
}