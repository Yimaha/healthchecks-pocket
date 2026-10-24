import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '@/core/app';
import { settings } from '@/core/storage';
import { checkIsDue, latestRelease, shouldOffer, type Release } from '@/core/updates';
import { platform } from '@/platform';

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

export function useUpdateState(): UpdateState {
  const supported = platform.updatesSupported;
  const [enabled, setEnabledState] = useState(true);
  const [offer, setOffer] = useState<Release | null>(null);

  // Daily check on launch.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      const on = (await settings.get('updates.enabled')) !== '0';
      if (!cancelled) setEnabledState(on);
      const last = Number(await settings.get('updates.lastCheck')) || null;
      if (!on || !checkIsDue(last, Date.now())) return;
      try {
        const latest = await latestRelease();
        await settings.set('updates.lastCheck', String(Date.now()));
        const skipped = await settings.get('updates.skipped');
        if (!cancelled && shouldOffer(APP_VERSION, latest.version, skipped)) setOffer(latest);
      } catch {
        // Offline or GitHub unavailable: try again on a later launch.
      }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    if (!on) setOffer(null);
    void settings.set('updates.enabled', on ? '1' : '0').catch(() => {});
  }, []);

  const download = useCallback(() => {
    if (offer) platform.openExternal(offer.url);
    setOffer(null);
  }, [offer]);
  const skip = useCallback(() => {
    if (offer) void settings.set('updates.skipped', offer.version).catch(() => {});
    setOffer(null);
  }, [offer]);
  const later = useCallback(() => setOffer(null), []);

  // On demand: also offers a version that was skipped.
  const checkNow = useCallback(async (): Promise<CheckResult> => {
    try {
      const latest = await latestRelease();
      await settings.set('updates.lastCheck', String(Date.now()));
      if (shouldOffer(APP_VERSION, latest.version, null)) {
        setOffer(latest);
        return 'available';
      }
      return 'latest';
    } catch {
      return 'error';
    }
  }, []);

  return useMemo(
    () => ({ supported, enabled, setEnabled, offer, download, skip, later, checkNow }),
    [supported, enabled, setEnabled, offer, download, skip, later, checkNow],
  );
}
