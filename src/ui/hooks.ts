import { useCallback, useEffect, useRef, useState } from 'react'
import { platform } from '../platform'

// ------------------------------------------------------------- data hooks

export interface Async<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  /** When data last loaded successfully (ms since epoch). */
  updatedAt: number | undefined
  reload: () => void
}

/** Runs `load` on mount and whenever `deps` change; keeps the last good data
 *  while reloading so the screen doesn't flash. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<number>()
  const seq = useRef(0)

  const run = useCallback(() => {
    const id = ++seq.current
    setLoading(true)
    load().then(
      (d) => { if (id === seq.current) { setData(d); setError(undefined); setLoading(false); setUpdatedAt(Date.now()) } },
      (e: Error) => { if (id === seq.current) { setError(e); setLoading(false) } },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])
  return { data, error, loading, updatedAt, reload: run }
}

/** Calls `fn` every `ms` while the app is visible, and right away when it
 *  comes back to the foreground. */
export function useAutoRefresh(fn: () => void, ms: number): void {
  const saved = useRef(fn)
  useEffect(() => {
    saved.current = fn
  })
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') saved.current() }
    const timer = setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [ms])
}

/** Re-render every second so "3m 12s ago" labels tick between fetches. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** A value remembered on this device (e.g. a folded section, a text size).
 *  Values that don't parse fall back to `initial`. */
function useStored<T>(key: string, initial: T, parse: (raw: string) => T | undefined, format: (v: T) => string): [T, (v: T) => void] {
  const storageKey = `healthchecks-pocket.${key}`
  const [value, setValue] = useState(initial)
  useEffect(() => {
    void platform.load(storageKey).then((raw) => {
      const v = raw == null ? undefined : parse(raw)
      if (v !== undefined) setValue(v)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  const set = useCallback((v: T) => {
    setValue(v)
    void platform.save(storageKey, format(v)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  return [value, set]
}

/** A boolean remembered on this device. */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  return useStored(key, initial, (raw) => raw === '1', (v) => (v ? '1' : '0'))
}

/** A whole number remembered on this device, kept within [min, max]. */
export function useStoredNumber(key: string, initial: number, min: number, max: number): [number, (v: number) => void] {
  return useStored(
    key,
    initial,
    (raw) => {
      const n = Number(raw)
      return Number.isInteger(n) && n >= min && n <= max ? n : undefined
    },
    String,
  )
}
