import { useEffect, useState } from 'react';
import type { BackgroundMode } from '@/core/theme';
import { HeartbeatMonitor } from './heartbeat-monitor/HeartbeatMonitor';

/** Slowly drifting northern lights: something is happening (startup,
 *  first-launch setup, any load or refresh), and it's a nice first look.
 *  Decorative; it holds still for people who prefer reduced motion. */
function Aurora({ className }: { className?: string }) {
  return (
    <div className={`aurora${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

/** Shown at least this long, so a quick load doesn't flicker. */
const MIN_SHOWN_MS = 900;
const FADE_MS = 600; // .aurora-loading transition

/** When loads started and ended (performance.now(); 0 = never), and whether
 *  one is in flight. Times rather than a flag, so even a load that starts
 *  and ends within one update shows the lights. */
export interface LoadTimes {
  busy: boolean;
  lastStart: number;
  lastEnd: number;
}

/** The background, as chosen in Appearance:
 *  - 'loading': northern lights behind any screen while data loads or refreshes (and during
 *    startup and first-launch setup): fade in, stay at least MIN_SHOWN_MS,
 *    fade out, then unmount, so nothing animates while idle
 *  - 'always': northern lights all the time; 'breathing': all the time, fading on and off
 *  - 'heartbeat': a heartbeat-monitor trace, all the time
 *  - 'off': none */
export function AppBackground({ mode, busy, lastStart, lastEnd }: LoadTimes & { mode: BackgroundMode }) {
  const [now, setNow] = useState(() => performance.now());
  const fadeAt = Math.max(lastStart + MIN_SHOWN_MS, lastEnd);
  const goneAt = fadeAt + FADE_MS;

  // Re-render when it's time to fade, and to go (at once for a moment that
  // has already passed, e.g. a long load fades as soon as it ends).
  useEffect(() => {
    if (mode !== 'loading' || busy || !lastStart) return;
    const nowMs = performance.now();
    const timers = [fadeAt, goneAt]
      .filter((at) => now < at)
      // At least `at`: performance.now() is rounded, so a timer can seem to fire a hair early, and the same `now` again
      // wouldn't re-render, leaving the lights on (animating unseen) for good.
      .map((at) => setTimeout(() => setNow(Math.max(performance.now(), at)), Math.max(0, at - nowMs)));
    return () => timers.forEach(clearTimeout);
  }, [mode, busy, lastStart, fadeAt, goneAt, now]);

  if (mode === 'off') return null;
  if (mode === 'always') return <Aurora className="aurora-loading" />;
  if (mode === 'breathing') return <Aurora className="aurora-breathing" />;
  if (mode === 'heartbeat') return <HeartbeatMonitor />;
  if (!lastStart || (!busy && now >= goneAt)) return null;
  return <Aurora className={`aurora-loading${!busy && now >= fadeAt ? ' aurora-leaving' : ''}`} />;
}
