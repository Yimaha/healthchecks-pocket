import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettingsStore, DEFAULT_APP_SETTINGS, type AppSettings } from '@/core/app-settings/appSettingsStore';

// The app settings (core/app-settings), read once at launch and shared: App passes them to each shared state that
// shows one, and each change is saved from here.

export interface AppSettingsState {
  /** The saved app settings; the defaults until they're read. */
  appSettings: AppSettings;
  /** The saved settings have been read (or couldn't be): `appSettings` is what's saved, not the defaults. */
  appSettingsRead: boolean;
  /** Shows these settings at once and saves them. A failed save isn't worth an error: like a view choice, it's kept
   *  until the app closes. */
  changeAppSettings: (changedAppSettings: Partial<AppSettings>) => void;
}

// Only App provides it, around every screen: null means a component is outside App.
export const AppSettingsContext = createContext<AppSettingsState | null>(null);

/** The app settings, for a component that shows one; App passes them to the shared states itself. */
export function useAppSettings(): AppSettingsState {
  const appSettingsState = useContext(AppSettingsContext);
  if (!appSettingsState) {
    throw new Error('useAppSettings needs the AppSettingsContext that App provides');
  }
  return appSettingsState;
}

/** Reads the app settings at launch, and saves each change. */
export function useAppSettingsState(): AppSettingsState {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appSettingsRead, setAppSettingsRead] = useState(false);
  // Changes made while the saved settings are read; null once they're read.
  const changedWhileReading = useRef<Partial<AppSettings> | null>({});
  useEffect(() => {
    const showSavedAppSettings = (savedAppSettings: AppSettings) => {
      // A change made while they were read is newer than what was read.
      setAppSettings({ ...savedAppSettings, ...changedWhileReading.current });
      changedWhileReading.current = null;
      setAppSettingsRead(true);
    };
    const keepDefaultAppSettings = () => {
      // As when each setting was read on its own, the defaults stay.
      changedWhileReading.current = null;
      setAppSettingsRead(true);
    };
    void AppSettingsStore.load().then(showSavedAppSettings, keepDefaultAppSettings);
  }, []);
  const changeAppSettings = useCallback((changedAppSettings: Partial<AppSettings>) => {
    if (changedWhileReading.current) {
      Object.assign(changedWhileReading.current, changedAppSettings);
    }
    setAppSettings((shownAppSettings) => ({ ...shownAppSettings, ...changedAppSettings }));
    void AppSettingsStore.save(changedAppSettings).catch(() => {});
  }, []);
  return useMemo(() => ({ appSettings, appSettingsRead, changeAppSettings }), [appSettings, appSettingsRead, changeAppSettings]);
}
