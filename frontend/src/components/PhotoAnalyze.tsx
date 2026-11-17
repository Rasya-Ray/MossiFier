import { useState } from 'react'
import { api } from '../api'

export default function PhotoAnalyze() {
  const [img, setImg] = useState<string | null>(null)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try {
      const r = await api.analyze(f)
      setImg(r.image); setSummary(r.summary)
    } catch (err) { alert((err as Error).message) }
    setBusy(false)
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
      <h2 className="text-sm font-semibold">Analisis foto</h2>
      <input type="file" accept="image/*" onChange={onFile} disabled={busy}
        className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-100" />
      {img && <img src={img} alt="hasil" className="w-full rounded-lg" />}
      {summary && <pre className="whitespace-pre-wrap text-sm text-slate-300">{summary}</pre>}
    </div>
  )
}