import { settings } from '@/core/storage/storage';
import { APP_SETTINGS_V1_KEYS, type SavedAppSettingsV1 } from './appSettingsV1';

/** The app settings as one version saved them, not yet decoded. */
export type RawAppSettings = { version: 1; savedAppSettingsV1: SavedAppSettingsV1 };

/** Finds the newest version of the app settings saved on this device. */
export class AppSettingsRetriever {
  /** The newest version saved, as saved. Version 1 is always found: it's a key each, and a key that isn't saved (all of
   *  them, on a fresh install) is read as its default. */
  static async retrieveNewestRaw(): Promise<RawAppSettings> {
    return { version: 1, savedAppSettingsV1: await AppSettingsRetriever.retrieveV1() };
  }

  private static async retrieveV1(): Promise<SavedAppSettingsV1> {
    const savedValues = await Promise.all(APP_SETTINGS_V1_KEYS.map((appSettingsV1Key) => settings.get(appSettingsV1Key)));
    return Object.fromEntries(APP_SETTINGS_V1_KEYS.map((appSettingsV1Key, keyIndex) => [appSettingsV1Key, savedValues[keyIndex]])) as SavedAppSettingsV1;
  }
}
