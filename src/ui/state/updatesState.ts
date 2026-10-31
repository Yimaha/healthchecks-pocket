import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '@/core/app';
import { checkIsDue, latestRelease, shouldOffer, type Release } from '@/core/updates/updates';
import { platform } from '@/platform';
import type { AppSettingsState } from './appSettingsState';

// New-version check: once a day on launch (unless turned off), and on demand
// from Settings. A found version is offered until the user downloads it,
// skips it (remembered: only a newer one is offered again) or picks Later
// (until the next daily check).

export type CheckResult = 'available' | 'latest' | 'error';

export interface UpdateState {
  supported: boolean;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** A newer version to offer, if any. */
  offer: Release | null;
  download: () => void;
  skip: () => void;
  later: () => void;
  checkNow: () => Promise<CheckResult>;
}

export const UpdateContext = createContext<UpdateState>({
  supported: false,
  enabled: false,
  setEnabled: () => {},
  offer: null,
  download: () => {},
  skip: () => {},
  later: () => {},
  checkNow: async () => 'latest',
});
export const useUpdates = () => useContext(UpdateContext);

export function useUpdateState({ appSettings, appSettingsRead, changeAppSettings }: AppSettingsState): UpdateState {
  const supported = platform.updatesSupported;
  const { checkForUpdates: enabled, lastUpdateCheckMs, skippedUpdateVersion } = appSettings;
  const [offer, setOffer] = useState<Release | null>(null);
  const launchCheckStarted = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Daily check on launch, once the saved settings say whether it's on and when it last ran.
  useEffect(() => {
    if (!supported || !appSettingsRead || launchCheckStarted.current) {
      return;
    }
    launchCheckStarted.current = true;
    if (!enabled || !checkIsDue(lastUpdateCheckMs, Date.now())) {
      return;
    }
    void (async () => {
      try {
        const latest = await latestRelease();
        changeAppSettings({ lastUpdateCheckMs: Date.now() });
        if (mounted.current && shouldOffer(APP_VERSION, latest.version, skippedUpdateVersion)) {
          setOffer(latest);
        }
      } catch {
        // Offline or GitHub unavailable: try again on a later launch.
      }
    })();
  }, [supported, appSettingsRead, enabled, lastUpdateCheckMs, skippedUpdateVersion, changeAppSettings]);

  const setEnabled = useCallback((on: boolean) => {
    if (!on) {
      setOffer(null);
    }
    changeAppSettings({ checkForUpdates: on });
  }, [changeAppSettings]);

  const download = useCallback(() => {
    if (offer) {
      platform.openExternal(offer.url);
    }
    setOffer(null);
  }, [offer]);
  const skip = useCallback(() => {
    if (offer) {
      changeAppSettings({ skippedUpdateVersion: offer.version });
    }
    setOffer(null);
  }, [offer, changeAppSettings]);
  const later = useCallback(() => setOffer(null), []);

  // On demand: also offers a version that was skipped.
  const checkNow = useCallback(async (): Promise<CheckResult> => {
    try {
      const latest = await latestRelease();
      changeAppSettings({ lastUpdateCheckMs: Date.now() });
      if (shouldOffer(APP_VERSION, latest.version, null)) {
        setOffer(latest);
        return 'available';
      }
      return 'latest';
    } catch {
      return 'error';
    }
  }, [changeAppSettings]);

  return useMemo(
    () => ({ supported, enabled, setEnabled, offer, download, skip, later, checkNow }),
    [supported, enabled, setEnabled, offer, download, skip, later, checkNow],
  );
}
