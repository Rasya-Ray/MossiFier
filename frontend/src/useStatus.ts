import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Status } from './types'

export function useStatus(ms = 1000) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const s = await api.status()
      if (alive.current) { setStatus(s); setError(null) }
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    // dibungkus setTimeout supaya tidak ada setState sinkron di dalam effect
    const tick = () => { void refresh(); setNow(Date.now()) }
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, ms)
    return () => {
      alive.current = false
      clearTimeout(first)
      clearInterval(id)
    }
  }, [refresh, ms])

  return { status, error, now, refresh }
}