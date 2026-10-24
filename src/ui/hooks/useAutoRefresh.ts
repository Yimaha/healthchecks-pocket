import { useEffect, useRef } from 'react';

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
