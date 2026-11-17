import type { Status } from '../types'

export default function LiveView({ status }: { status: Status | null }) {
  const running = !!status?.running
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center text-sm text-slate-400">
        <span>Live grid 16 × 16</span>
        <span className="ml-auto">{status?.frames ?? 0} frame / jendela</span>
      </div>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black">
        {running
          ? <img src="/api/stream.mjpg" alt="live" className="h-full w-full object-contain" />
          : <span className="text-slate-600">Mesin berhenti</span>}
      </div>
      {status?.error && <p className="mt-2 text-sm text-rose-400">{status.error}</p>}
      {status?.esp32 && <p className="mt-1 text-xs text-slate-500">ESP32: {status.esp32}</p>}
    </div>
  )
}