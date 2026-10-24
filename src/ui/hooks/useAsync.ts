import { useCallback, useEffect, useRef, useState } from 'react';
import { useReportLoading } from '@/ui/state/loadingState';

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
 *  lights show behind the screen (loadingState.ts). */
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
