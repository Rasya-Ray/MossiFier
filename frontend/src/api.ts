import type { Camera, Status } from './types'

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!r.ok) throw new Error((await r.text()) || r.statusText)
  return r.json() as Promise<T>
}

export const api = {
  status: () => j<Status>('/api/status'),
  start: (cfg: Record<string, unknown>) =>
    j<Status>('/api/start', { method: 'POST', body: JSON.stringify(cfg) }),
  stop: () => j<Status>('/api/stop', { method: 'POST' }),
  patch: (cfg: Record<string, unknown>) =>
    j<Status>('/api/config', { method: 'PATCH', body: JSON.stringify(cfg) }),
  cameras: () => j<{ cameras: Camera[] }>('/api/cameras'),
  testEsp: (url: string) =>
    j<{ ok: boolean; steps: { ok: boolean; msg: string }[] }>(
      '/api/esp32/test', { method: 'POST', body: JSON.stringify({ url }) }),
  analyze: async (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch('/api/analyze', { method: 'POST', body: fd })
    if (!r.ok) throw new Error(await r.text())
    return r.json() as Promise<{ image: string; summary: string; status: string }>
  },
}