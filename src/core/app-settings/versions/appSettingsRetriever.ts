import { settings } from '@/core/storage/storage';
import { APP_SETTINGS_V1_KEYS, type SavedAppSettingsV1 } from './appSettingsV1';
import { APP_SETTINGS_V2_KEY } from './appSettingsV2';

/** The app settings as one version saved them, not yet decoded. */
export type RawAppSettings =
  | { version: 1; savedAppSettingsV1: SavedAppSettingsV1 }
  | { version: 2; appSettingsV2Json: string };

/** Finds the newest version of the app settings saved on this device. */
export class AppSettingsRetriever {
  /** The newest version saved, as saved; null when none is (a fresh install). Version 1 is a key each: it's found when
   *  any of them is saved, and a key that isn't is read as its default. A version newer than this app's isn't looked
   *  for: this app can't read it. */
  static async retrieveNewestRaw(): Promise<RawAppSettings | null> {
    const appSettingsV2Json = await settings.get(APP_SETTINGS_V2_KEY);
    if (appSettingsV2Json !== null) {
      return { version: 2, appSettingsV2Json };
    }
    const savedAppSettingsV1 = await AppSettingsRetriever.retrieveV1();
    if (Object.values(savedAppSettingsV1).every((savedValue) => savedValue === null)) {
      return null;
    }
    return { version: 1, savedAppSettingsV1 };
  }

  private static async retrieveV1(): Promise<SavedAppSettingsV1> {
    const savedValues = await Promise.all(APP_SETTINGS_V1_KEYS.map((appSettingsV1Key) => settings.get(appSettingsV1Key)));
    return Object.fromEntries(APP_SETTINGS_V1_KEYS.map((appSettingsV1Key, keyIndex) => [appSettingsV1Key, savedValues[keyIndex]])) as SavedAppSettingsV1;
  }
}
