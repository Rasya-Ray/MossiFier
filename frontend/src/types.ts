export type HistoryRow = {
  time: string; moss_pct: number; healthy_pct: number
  stressed_pct: number; critical_pct: number
}

export type Config = {
  camera: string; interval: number; esp32_url: string; esp32_every: number
  esp32_timeout: number; fps: number; smooth: number; log: string
}

export type Status = {
  running: boolean; status: string | null
  moss_pct: number; healthy_pct: number; stressed_pct: number; critical_pct: number
  frames: number; updated_at: number | null
  history: HistoryRow[]; config: Config
  esp32: string | null; error: string | null; uptime: number
}

export type Camera = { index: number; label: string }