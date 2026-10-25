import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { LoadTimes } from '@/ui/background/AppBackground';

// App-wide "something is loading" signal for the northern lights: every data
// load (useAsync) reports while it's in flight. useLoadingState counts them.
export const LoadingContext = createContext<(delta: 1 | -1) => void>(() => {});

export function useReportLoading(loading: boolean): void {
  const report = useContext(LoadingContext);
  useEffect(() => {
    if (!loading) {
      return;
    }
    report(1);
    return () => report(-1);
  }, [loading, report]);
}

/** Counts the loads in flight that LoadingContext reports, for the background (AppBackground). */
export function useLoadingState(): { reportLoading: (delta: 1 | -1) => void; loadTimes: LoadTimes } {
  const [loads, setLoads] = useState(0);
  const [lastStart, setLastStart] = useState(0);
  const [lastEnd, setLastEnd] = useState(0);
  const reportLoading = useCallback((delta: 1 | -1) => {
    setLoads((count) => count + delta);
    if (delta > 0) {
      setLastStart(performance.now());
    } else {
      setLastEnd(performance.now());
    }
  }, []);
  return { reportLoading, loadTimes: { busy: loads > 0, lastStart, lastEnd } };
}
