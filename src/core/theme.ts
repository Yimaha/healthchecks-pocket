// Light and dark: by the clock (the default), fixed, or following the
// system's setting.

export type ThemeMode = 'auto' | 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'dark', 'system']
export const DEFAULT_THEME_MODE: ThemeMode = 'auto'

/** Auto is dark from DARK_FROM:00 until DARK_UNTIL:00, local time. */
export const DARK_FROM = 19
export const DARK_UNTIL = 7

export function parseThemeMode(raw: string | null): ThemeMode {
  return THEME_MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : DEFAULT_THEME_MODE
}

export function resolveTheme(mode: ThemeMode, now: Date, systemDark: boolean): Theme {
  if (mode === 'light' || mode === 'dark') return mode
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  const h = now.getHours()
  return h >= DARK_FROM || h < DARK_UNTIL ? 'dark' : 'light'
}

/** The northern-lights background: only while loading, always, always but
 *  slowly fading on and off ("breathing"), or none. */
export type LightsMode = 'loading' | 'always' | 'breathing' | 'off'
export const LIGHTS_MODES: LightsMode[] = ['loading', 'always', 'breathing', 'off']
export const DEFAULT_LIGHTS_MODE: LightsMode = 'always'

export function parseLightsMode(raw: string | null): LightsMode {
  return LIGHTS_MODES.includes(raw as LightsMode) ? (raw as LightsMode) : DEFAULT_LIGHTS_MODE
}
