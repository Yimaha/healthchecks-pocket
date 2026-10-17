// Light and dark: fixed (dark by default), by the clock, or following the
// system's setting.

export type ThemeMode = 'auto' | 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'dark', 'system'];
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

/** Auto is dark from DARK_FROM:00 until DARK_UNTIL:00, local time. */
export const DARK_FROM = 19;
export const DARK_UNTIL = 7;

export function parseThemeMode(raw: string | null): ThemeMode {
  return THEME_MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : DEFAULT_THEME_MODE;
}

export function resolveTheme(mode: ThemeMode, now: Date, systemDark: boolean): Theme {
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  const hour = now.getHours();
  return hour >= DARK_FROM || hour < DARK_UNTIL ? 'dark' : 'light';
}

/** The background: northern lights only while loading, always, or always
 *  but slowly fading on and off ("breathing"); a heartbeat-monitor trace; or
 *  none. Saved under the 'lights' key, with the values it had when the
 *  northern lights were the only background. */
export type BackgroundMode = 'loading' | 'always' | 'breathing' | 'heartbeat' | 'off';
export const BACKGROUND_MODES: BackgroundMode[] = ['loading', 'always', 'breathing', 'heartbeat', 'off'];
export const DEFAULT_BACKGROUND_MODE: BackgroundMode = 'breathing';

export function parseBackgroundMode(raw: string | null): BackgroundMode {
  return BACKGROUND_MODES.includes(raw as BackgroundMode) ? (raw as BackgroundMode) : DEFAULT_BACKGROUND_MODE;
}
