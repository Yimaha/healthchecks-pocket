import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settings } from '../core/storage';
import { DARK_FROM, DARK_UNTIL, DEFAULT_LIGHTS_MODE, DEFAULT_THEME_MODE, parseLightsMode, parseThemeMode, resolveTheme, type LightsMode, type Theme, type ThemeMode } from '../core/theme';
import { platform } from '../platform';

// The app's look: light/dark theme and the northern-lights background. App
// provides the chosen modes; Settings and onboarding change them, and the
// page restyles at once.

const SURFACE: Record<Theme, string> = { light: '#ffffff', dark: '#171a21' }; // --surface, for the browser's bars

/** Restyle the page (index.css keys the dark palette on data-theme). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SURFACE[theme]);
  platform.setDarkBars(theme === 'dark');
}

const systemQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  lights: LightsMode;
  setLights: (lights: LightsMode) => void;
}

export const ThemeContext = createContext<ThemeState>({
  mode: DEFAULT_THEME_MODE,
  setMode: () => {},
  lights: DEFAULT_LIGHTS_MODE,
  setLights: () => {},
});
export const useTheme = () => useContext(ThemeContext);

/** The saved mode, applied now and kept up to date: by the clock (checked
 *  every minute and when the app comes back), or as the system changes. */
export function useThemeState(): ThemeState {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [lights, setLightsState] = useState<LightsMode>(DEFAULT_LIGHTS_MODE);
  useEffect(() => {
    void settings.get('theme').then((raw) => setModeState(parseThemeMode(raw)));
    void settings.get('lights').then((raw) => setLightsState(parseLightsMode(raw)));
  }, []);

  useEffect(() => {
    const query = systemQuery();
    const apply = () => applyTheme(resolveTheme(mode, new Date(), !!query?.matches));
    apply();
    const timer = mode === 'auto' ? setInterval(apply, 60_000) : undefined;
    document.addEventListener('visibilitychange', apply);
    if (mode === 'system') query?.addEventListener('change', apply);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', apply);
      query?.removeEventListener('change', apply);
    };
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    void settings.set('theme', newMode).catch(() => {});
  }, []);
  const setLights = useCallback((newLights: LightsMode) => {
    setLightsState(newLights);
    void settings.set('lights', newLights).catch(() => {});
  }, []);
  return useMemo(() => ({ mode, setMode, lights, setLights }), [mode, setMode, lights, setLights]);
}

const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
export const THEME_LABEL: Record<ThemeMode, string> = {
  auto: `Auto: dark from ${pad(DARK_FROM)} to ${pad(DARK_UNTIL)}`,
  light: 'Light',
  dark: 'Dark',
  system: 'Follow system',
};

export const LIGHTS_LABEL: Record<LightsMode, string> = {
  always: 'Northern lights, always',
  loading: 'Northern lights while loading',
  breathing: 'Northern lights, breathing',
  off: 'None',
};
