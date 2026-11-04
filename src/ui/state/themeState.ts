import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { DARK_FROM, DARK_UNTIL, DEFAULT_BACKGROUND_MODE, DEFAULT_THEME_MODE, resolveTheme, type BackgroundMode, type Theme, type ThemeMode } from '@/core/preferences/theme';
import { platform } from '@/platform';
import type { AppSettingsState } from './appSettingsState';

// The app's look: light/dark theme and the background. App
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
  background: BackgroundMode;
  setBackground: (background: BackgroundMode) => void;
}

export const ThemeContext = createContext<ThemeState>({
  mode: DEFAULT_THEME_MODE,
  setMode: () => {},
  background: DEFAULT_BACKGROUND_MODE,
  setBackground: () => {},
});
export const useTheme = () => useContext(ThemeContext);

/** The saved mode, applied now and kept up to date: by the clock (checked
 *  every minute and when the app comes back), or as the system changes. */
export function useThemeState({ appSettings, changeAppSettings }: AppSettingsState): ThemeState {
  const { themeMode: mode, background } = appSettings;

  useEffect(() => {
    const query = systemQuery();
    const apply = () => applyTheme(resolveTheme(mode, new Date(), !!query?.matches));
    apply();
    const timer = mode === 'auto' ? setInterval(apply, 60_000) : undefined;
    document.addEventListener('visibilitychange', apply);
    if (mode === 'system') {
      query?.addEventListener('change', apply);
    }
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', apply);
      query?.removeEventListener('change', apply);
    };
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => changeAppSettings({ themeMode: newMode }), [changeAppSettings]);
  const setBackground = useCallback((newBackground: BackgroundMode) => changeAppSettings({ background: newBackground }), [changeAppSettings]);
  return useMemo(() => ({ mode, setMode, background, setBackground }), [mode, setMode, background, setBackground]);
}

const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
export const THEME_LABEL: Record<ThemeMode, string> = {
  auto: `Auto: dark from ${pad(DARK_FROM)} to ${pad(DARK_UNTIL)}`,
  light: 'Light',
  dark: 'Dark',
  system: 'Follow system',
};

export const BACKGROUND_LABEL: Record<BackgroundMode, string> = {
  always: 'Northern lights, always',
  loading: 'Northern lights while loading',
  breathing: 'Northern lights, breathing',
  heartbeat: 'Heartbeat monitor',
  off: 'None',
};
