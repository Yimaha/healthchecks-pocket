// Everything the app saves about itself, apart from the projects and their API keys, and the check icons: read in
// whichever version saved it (./versions), brought up to the latest.

import { queueStorageWrite, settings } from '@/core/storage/storage';
import { AppSettingsDecodeRouter } from './versions/appSettingsDecodeRouter';
import { AppSettingsPromoter } from './versions/appSettingsPromoter';
import { AppSettingsRetriever } from './versions/appSettingsRetriever';
import { APP_SETTINGS_V2_KEY, DEFAULT_APP_SETTINGS_V2 } from './versions/appSettingsV2';
import { LATEST_APP_SETTINGS_VERSION, type LatestAppSettings } from './versions/appSettingsVersions';

/** The app settings as the app reads and saves them: the latest version's shape. */
export type AppSettings = LatestAppSettings;

/** What a fresh install reads, and what the app shows until the saved settings are read. */
export const DEFAULT_APP_SETTINGS: AppSettings = DEFAULT_APP_SETTINGS_V2;

/** Where the latest version is saved. */
const LATEST_APP_SETTINGS_KEY = APP_SETTINGS_V2_KEY;

/** Reads and saves the app settings. */
export class AppSettingsStore {
  /** In the write queue, so no save runs between reading an older version and saving it promoted. */
  static load(): Promise<AppSettings> {
    // Until the launch sequence (#176) promotes them before anything reads, they're promoted here, as they're read.
    return queueStorageWrite(() => AppSettingsStore.readPromotingSaved());
  }

  /** When only an older version is saved, saves the app settings once in the latest version, beside the older one,
   *  which stays as it was. */
  static async promoteSavedToLatestVersion(): Promise<void> {
    await queueStorageWrite(() => AppSettingsStore.readPromotingSaved());
  }

  /** Saves these settings in the latest version, and leaves the rest as saved. In the write queue, like every save. */
  static save(changedAppSettings: Partial<AppSettings>): Promise<void> {
    return queueStorageWrite(async () => {
      // Read again here, not taken from the screen: another save may have changed other settings since.
      const savedAppSettings = await AppSettingsStore.readPromotingSaved();
      await settings.set(LATEST_APP_SETTINGS_KEY, JSON.stringify({ ...savedAppSettings, ...changedAppSettings }));
    });
  }

  /** The saved settings in the latest version's shape, saved as the latest version first when an older one was read.
   *  One read of each key: on a phone each is a call to Android. Runs inside the write queue only. */
  private static async readPromotingSaved(): Promise<AppSettings> {
    const rawAppSettings = await AppSettingsRetriever.retrieveNewestRaw();
    if (rawAppSettings === null) {
      // A fresh install, which saves its first change in the latest version.
      return DEFAULT_APP_SETTINGS;
    }
    const latestAppSettings = AppSettingsPromoter.promoteToLatest(AppSettingsDecodeRouter.decode(rawAppSettings));
    if (rawAppSettings.version !== LATEST_APP_SETTINGS_VERSION) {
      await settings.set(LATEST_APP_SETTINGS_KEY, JSON.stringify(latestAppSettings));
    }
    return latestAppSettings;
  }
}
