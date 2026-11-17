import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------- bantuan API
async function api(path, options) {
  const res = await fetch(path, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const post = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

const STATUS_COLOR = { healthy: '#3cc83c', stressed: '#ffd700', critical: '#dc3c28' }
const fmt = (v) => (v === null || v === undefined ? '-' : `${Math.round(v)}%`)

function Bar({ label, value, color }) {
  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{label}</span>
        <b>{fmt(value)}</b>
      </div>
      <div className="bar">
        <div style={{ width: `${value || 0}%`, background: color }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- aplikasi
export default function App() {
  const [state, setState] = useState(null) // data dari /api/state (diperbarui tiap detik)
  const [online, setOnline] = useState(true) // apakah backend Python terjangkau
  const [form, setForm] = useState(null) // salinan pengaturan yang sedang diedit
  const [cameras, setCameras] = useState([])
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState(null) // { type: 'ok' | 'err', text }
  const [busy, setBusy] = useState(false)
  const [videoKey, setVideoKey] = useState(0) // diganti tiap mesin dinyalakan agar stream dimuat ulang
  const [upload, setUpload] = useState(null)
  const wasRunning = useRef(false)
  const scanned = useRef(false)

  // Ambil status backend tiap 1 detik
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const s = await api('/api/state')
        if (!alive) return
        setState(s)
        setOnline(true)
        setForm((f) => f ?? { ...s.config }) // isi form hanya sekali, supaya ketikan tidak tertimpa
        if (s.running && !wasRunning.current) setVideoKey((k) => k + 1)
        wasRunning.current = s.running
      } catch {
        if (alive) setOnline(false)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const loadCameras = useCallback(async () => {
    setScanning(true)
    try {
      const d = await api('/api/cameras')
      setCameras(d.cameras)
    } catch (e) {
      setNotice({ type: 'err', text: e.message })
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!scanned.current) {
      scanned.current = true
      loadCameras()
    }
  }, [loadCameras])

  // Jalankan aksi dengan penanda "sibuk" dan pesan hasil
  const run = async (fn, okText) => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      if (okText) setNotice({ type: 'ok', text: okText })
    } catch (e) {
      setNotice({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const start = () => run(() => post('/api/start'))
  const stop = () => run(() => post('/api/stop'))
  const save = () =>
    run(async () => {
      const d = await post('/api/config', form)
      setForm({ ...d.config })
    }, 'Pengaturan disimpan.')
  const testEsp = () =>
    run(async () => {
      await post('/api/config', form)
      const d = await post('/api/esp32/test')
      setNotice({ type: d.ok ? 'ok' : 'err', text: `${d.url ?? ''} ${d.message}` })
    })
  const onUpload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    run(async () => setUpload(await api('/api/analyze-image', { method: 'POST', body: file })))
  }

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const onCamera = (e) =>
    setForm((f) => ({ ...f, source: e.target.value === '__manual__' ? '' : e.target.value }))

  if (!form) {
    return (
      <div className="app">
        <header>
          <h1>Mossifier</h1>
        </header>
        <div className="banner err">
          Menghubungkan ke backend... Pastikan <code>py server.py</code> sedang berjalan.
        </div>
      </div>
    )
  }

  const running = state?.running
  const stats = state?.stats ?? {}
  const hasMoss = Boolean(stats.status) && stats.status !== 'tidak ada lumut'
  const listed = cameras.some((c) => String(c.index) === String(form.source))
  const age = stats.updated_at && state ? Math.max(0, Math.round(state.server_time - stats.updated_at)) : null
  const history = (state?.history ?? []).slice().reverse().slice(0, 10)

  return (
    <div className="app">
      <header>
        <h1>Mossifier</h1>
        <span className={`badge ${running ? 'on' : 'off'}`}>{running ? 'MENYALA' : 'MATI'}</span>
        {!online && <span className="badge off">backend tidak terjangkau</span>}
        <div className="spacer" />
        <button className="btn start" disabled={busy || running || !online} onClick={start}>
          Nyalakan
        </button>
        <button className="btn stop" disabled={busy || !running || !online} onClick={stop}>
          Matikan
        </button>
      </header>

      {state?.error && <div className="banner err">{state.error}</div>}
      {notice && <div className={`banner ${notice.type}`}>{notice.text}</div>}

      <main>
        <section className="col">
          <div className="card">
            <h2>Video langsung (grid 16 x 16)</h2>
            {running ? (
              <img className="video" key={videoKey} src={`/video?t=${videoKey}`} alt="video langsung" />
            ) : (
              <div className="video placeholder">Mesin mati. Tekan &quot;Nyalakan&quot;.</div>
            )}
            <div className="legend">
              <span><i style={{ background: '#3cc83c' }} /> healthy</span>
              <span><i style={{ background: '#ffd700' }} /> stressed</span>
              <span><i style={{ background: '#dc3c28' }} /> critical</span>
              <span><i style={{ background: 'transparent', border: '1px solid #666' }} /> bukan lumut</span>
            </div>
          </div>

          <div className="card">
            <h2>Analisis gambar unggahan</h2>
            <input type="file" accept="image/*" onChange={onUpload} disabled={busy || !online} />
            {upload && (
              <div className="upload">
                <img className="video" src={upload.image} alt="hasil analisis" />
                <div className="muted">
                  Status: <b>{upload.summary.status}</b> | area lumut {fmt(upload.summary.moss_pct)}
                  {upload.summary.status !== 'tidak ada lumut' &&
                    ` | healthy ${fmt(upload.summary.healthy_pct)}, stressed ${fmt(
                      upload.summary.stressed_pct,
                    )}, critical ${fmt(upload.summary.critical_pct)}`}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="col">
          <div className="card">
            <h2>Status</h2>
            <div className="status" style={{ color: STATUS_COLOR[stats.status] || '#e8eaed' }}>
              {running ? stats.status || 'menunggu data...' : '-'}
            </div>
            <div className="muted">
              {age !== null && running ? `diperbarui ${age} dtk lalu (${stats.frames} frame)` : ' '}
            </div>
            <Bar label="Area lumut di frame" value={running ? stats.moss_pct : null} color="#8ab4f8" />
            <Bar label="Healthy" value={running && hasMoss ? stats.healthy_pct : null} color="#3cc83c" />
            <Bar label="Stressed" value={running && hasMoss ? stats.stressed_pct : null} color="#ffd700" />
            <Bar label="Critical" value={running && hasMoss ? stats.critical_pct : null} color="#dc3c28" />
            <div className="muted">Healthy, stressed, dan critical dihitung dari area lumut saja.</div>
          </div>

          <div className="card">
            <h2>Pengaturan</h2>

            <label>
              Kamera
              <div className="row">
                <select value={listed ? String(form.source) : '__manual__'} onChange={onCamera}>
                  {cameras.map((c) => (
                    <option key={c.index} value={String(c.index)}>
                      {c.label}
                    </option>
                  ))}
                  <option value="__manual__">Manual (nomor, path video, atau URL)</option>
                </select>
                <button className="btn" onClick={loadCameras} disabled={scanning || busy}>
                  {scanning ? 'Mencari...' : 'Cari kamera'}
                </button>
              </div>
            </label>
            {!listed && (
              <input
                placeholder="mis. 1  atau  C:\video\tes.mp4"
                value={form.source}
                onChange={set('source')}
              />
            )}
            <div className="muted">
              0 biasanya webcam bawaan laptop, 1 dan seterusnya webcam USB. Mengganti kamera saat menyala akan
              me-restart mesin.
            </div>

            <label>
              Interval hitung persentase (detik)
              <input type="number" min="0.5" step="0.5" value={form.interval} onChange={set('interval')} />
            </label>

            <h3>ESP32</h3>
            <label className="check">
              <input type="checkbox" checked={Boolean(form.esp32_enabled)} onChange={set('esp32_enabled')} />
              Kirim hasil ke ESP32
            </label>
            <label>
              IP ESP32
              <input placeholder="mis. 10.20.219.29" value={form.esp32_ip} onChange={set('esp32_ip')} />
            </label>
            <div className="row">
              <label className="grow">
                Path
                <input value={form.esp32_path} onChange={set('esp32_path')} />
              </label>
              <label className="grow">
                Kirim tiap (detik)
                <input type="number" min="1" step="1" value={form.esp32_every} onChange={set('esp32_every')} />
              </label>
              <label className="grow">
                Timeout (detik)
                <input type="number" min="0.5" step="0.5" value={form.esp32_timeout} onChange={set('esp32_timeout')} />
              </label>
            </div>
            <div className="row">
              <button className="btn primary" onClick={save} disabled={busy || !online}>
                Simpan
              </button>
              <button className="btn" onClick={testEsp} disabled={busy || !online}>
                Tes koneksi ESP32
              </button>
            </div>
            <div className="muted">Status kiriman: {state?.esp32 || '-'}</div>
          </div>

          <div className="card">
            <h2>Riwayat</h2>
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Status</th>
                  <th>Lumut</th>
                  <th>H</th>
                  <th>S</th>
                  <th>C</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={`${h.time}-${i}`}>
                    <td>{h.time}</td>
                    <td>{h.status}</td>
                    <td>{fmt(h.moss_pct)}</td>
                    <td>{h.status === 'tidak ada lumut' ? '-' : fmt(h.healthy_pct)}</td>
                    <td>{h.status === 'tidak ada lumut' ? '-' : fmt(h.stressed_pct)}</td>
                    <td>{h.status === 'tidak ada lumut' ? '-' : fmt(h.critical_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}