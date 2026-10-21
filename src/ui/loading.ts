import { createContext, useContext, useEffect } from 'react';

// App-wide "something is loading" signal for the northern lights: every data
// load (useAsync) reports while it's in flight. ScreensWithSharedState counts them.
export const LoadingContext = createContext<(delta: 1 | -1) => void>(() => {});

export function useReportLoading(loading: boolean): void {
  const report = useContext(LoadingContext);
  useEffect(() => {
    if (!loading) return;
    report(1);
    return () => report(-1);
  }, [loading, report]);
}
