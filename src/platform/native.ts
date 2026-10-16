import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import type { Platform } from '.';

// Android/iOS via Capacitor.
// - Secrets: SecureStorage encrypts each value with AES-GCM using a key that
//   lives in the Android Keystore (iOS: Keychain). The key can't be exported,
//   so a copied app-data file or backup is useless elsewhere; the secure
//   prefs are also excluded from Android backup and transfer.
// - Non-secrets: Preferences (SharedPreferences / UserDefaults), the only data
//   Android backs up (res/xml/data_extraction_rules.xml, backup_rules.xml).
//   See src/core/storage.ts for what goes where.
// - Carried API keys ("Keep API keys on this device only" off): Preferences
//   too, but in their own file, so the backup rules can keep them out of a
//   Google backup that isn't encrypted on the phone.
const securePrefix = SecureStorage.setKeyPrefix('healthchecks-pocket.');

const SETTINGS_GROUP = 'CapacitorStorage'; // the plugin's default: shared_prefs/CapacitorStorage.xml
const CARRIED_KEYS_GROUP = 'CarriedApiKeys'; // shared_prefs/CarriedApiKeys.xml
const CARRIED_KEYS_STORAGE_KEY = 'healthchecks-pocket.carriedKeys';

let configuredPreferencesGroup = SETTINGS_GROUP;
let lastPreferencesCall: Promise<unknown> = Promise.resolve();

/** One Preferences group: a file of its own in shared_prefs/. */
interface PreferencesGroup {
  /** Run a Preferences call in this group's file. */
  do<T>(preferencesCall: () => Promise<T>): Promise<T>;
}

/** inPreferencesGroup(group).do(call). configure() switches the file for every caller, so calls run one at a time. */
function inPreferencesGroup(preferencesGroup: string): PreferencesGroup {
  return {
    do(preferencesCall) {
      const queuedCall = lastPreferencesCall.then(async () => {
        if (configuredPreferencesGroup !== preferencesGroup) {
          await Preferences.configure({ group: preferencesGroup });
          configuredPreferencesGroup = preferencesGroup;
        }
        return preferencesCall();
      });
      lastPreferencesCall = queuedCall.catch(() => {}); // the next call waits for this one, whether it worked or not
      return queuedCall;
    },
  };
}

const preferencesGroupFor = (storageKey: string) => (storageKey === CARRIED_KEYS_STORAGE_KEY ? CARRIED_KEYS_GROUP : SETTINGS_GROUP);

async function loadPreference(preferencesGroup: string, storageKey: string): Promise<string | null> {
  return (await inPreferencesGroup(preferencesGroup).do(() => Preferences.get({ key: storageKey }))).value;
}

/** 0.5.3 and older kept carried keys in the settings file, which is backed up unencrypted too: move them out first. */
async function moveCarriedKeysOutOfSettings(): Promise<void> {
  const carriedKeysJsonInSettings = await loadPreference(SETTINGS_GROUP, CARRIED_KEYS_STORAGE_KEY);
  if (carriedKeysJsonInSettings === null) return;
  await inPreferencesGroup(CARRIED_KEYS_GROUP).do(() => Preferences.set({ key: CARRIED_KEYS_STORAGE_KEY, value: carriedKeysJsonInSettings }));
  await inPreferencesGroup(SETTINGS_GROUP).do(() => Preferences.remove({ key: CARRIED_KEYS_STORAGE_KEY }));
}

let lastDark: boolean | undefined;

/** Capacitor sets --safe-area-inset-top when the WebView is edge-to-edge. */
function drawsUnderBars(): boolean {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) > 0;
}

export const nativePlatform: Platform = {
  async load(key) {
    if (key === CARRIED_KEYS_STORAGE_KEY) await moveCarriedKeysOutOfSettings();
    return loadPreference(preferencesGroupFor(key), key);
  },
  async save(key, value) {
    await inPreferencesGroup(preferencesGroupFor(key)).do(() => Preferences.set({ key, value }));
  },
  async remove(key) {
    await inPreferencesGroup(preferencesGroupFor(key)).do(() => Preferences.remove({ key }));
  },
  async loadSecret(key) {
    await securePrefix;
    const value = await SecureStorage.get(key, false); // false: don't turn ISO dates into Date
    return typeof value === 'string' ? value : null;
  },
  async saveSecret(key, value) {
    await securePrefix;
    await SecureStorage.set(key, value, false);
  },
  async removeSecret(key) {
    await securePrefix;
    await SecureStorage.remove(key);
  },
  async clearAll() {
    await inPreferencesGroup(SETTINGS_GROUP).do(() => Preferences.clear()); // clear() empties only the group's own file
    await inPreferencesGroup(CARRIED_KEYS_GROUP).do(() => Preferences.clear());
    await securePrefix;
    await SecureStorage.clear(); // only keys with this app's prefix
  },
  openExternal(url) {
    void Browser.open({ url });
  },
  setDarkBars(dark) {
    lastDark = dark;
    // With a WebView that draws under the status bar (Chromium 140+), the bar
    // shows the app's header, so its icons follow the app's theme. Older
    // WebViews are inset below the bar, which then shows the system's
    // background: keep the system's icon colour there.
    const style = drawsUnderBars() ? (dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light) : SystemBarsStyle.Default;
    void SystemBars.setStyle({ style }).catch(() => {});
  },
  async copyText(text) {
    await Clipboard.write({ string: text });
  },
  async shareText(title, text) {
    try {
      await Share.share({ title, text, dialogTitle: title });
    } catch (error) {
      // Closing the share sheet without picking an app isn't an error.
      if (!/cancel/i.test(String((error as Error).message))) throw error;
    }
  },
  updatesSupported: true,
  secretProtection: Capacitor.getPlatform() === 'ios' ? 'keychain' : 'keystore',
};

// Android back button: go back a screen, or leave the app from the list.
void App.addListener('backButton', () => {
  if (location.hash && location.hash !== '#/') history.back();
  else void App.exitApp();
});

// The insets can arrive after the first theme was applied (or change with
// rotation): set the bar style again.
window.addEventListener('resize', () => {
  if (lastDark !== undefined) nativePlatform.setDarkBars(lastDark);
});
