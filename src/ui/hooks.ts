import { useCallback, useEffect, useRef, useState } from 'react';
import { settings, type SettingKey } from '@/core/storage/storage';
import { useReportLoading } from './loading';

// ------------------------------------------------------------- data hooks

export interface Async<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** When data last loaded successfully (ms since epoch). */
  updatedAt: number | undefined;
  reload: () => void;
}

/** Runs `load` on mount and whenever `deps` change; keeps the last good data
 *  while reloading so the screen doesn't flash. While it loads, the northern
 *  lights show behind the screen (loading.ts). */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const latestRequest = useRef(0);

  const run = useCallback(() => {
    const id = ++latestRequest.current;
    setLoading(true);
    load().then(
      (result) => { if (id === latestRequest.current) { setData(result); setError(undefined); setLoading(false); setUpdatedAt(Date.now()); } },
      (loadError: Error) => { if (id === latestRequest.current) { setError(loadError); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  useReportLoading(loading);
  return { data, error, loading, updatedAt, reload: run };
}

/** Calls `fn` every `ms` while the app is visible, and right away when it
 *  comes back to the foreground. Skips a tick while `isLoading`. */
export function useAutoRefresh(callback: () => void, ms: number, isLoading: boolean): void {
  const saved = useRef(callback);
  const savedIsLoading = useRef(isLoading);
  useEffect(() => {
    saved.current = callback;
    savedIsLoading.current = isLoading;
  });
  useEffect(() => {
    // A load still running would only make the new request wait behind it.
    const tick = () => { if (document.visibilityState === 'visible' && !savedIsLoading.current) saved.current(); };
    const timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);
}

/** Re-render every second so "3m 12s ago" labels tick between fetches. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** A value remembered on this device (e.g. a folded section, a text size).
 *  Values that don't parse fall back to `initial`. */
function useStored<T>(key: SettingKey, initial: T, parse: (raw: string) => T | undefined, format: (value: T) => string): [T, (value: T) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    void settings.get(key).then((raw) => {
      const value = raw == null ? undefined : parse(raw);
      if (value !== undefined) setValue(value);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((value: T) => {
    setValue(value);
    void settings.set(key, format(value)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, set];
}

/** A boolean remembered on this device. */
export function useStoredFlag(key: SettingKey, initial: boolean): [boolean, (value: boolean) => void] {
  return useStored(key, initial, (raw) => raw === '1', (on) => (on ? '1' : '0'));
}

/** A whole number remembered on this device, kept within [min, max]. */
export function useStoredNumber(key: SettingKey, initial: number, min: number, max: number): [number, (value: number) => void] {
  return useStored(
    key,
    initial,
    (raw) => {
      const value = Number(raw);
      return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
    },
    String,
  );
}
