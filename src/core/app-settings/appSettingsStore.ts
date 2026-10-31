// Everything the app saves about itself, apart from the projects and their API keys, and the check icons: read in
// whichever version saved it (./versions), brought up to the latest.

import { queueStorageWrite, settings } from '@/core/storage/storage';
import { AppSettingsDecodeRouter } from './versions/appSettingsDecodeRouter';
import { AppSettingsPromoter } from './versions/appSettingsPromoter';
import { AppSettingsRetriever } from './versions/appSettingsRetriever';
import { encodeAppSettingsV1, type AppSettingsV1Key } from './versions/appSettingsV1';
import type { LatestAppSettings } from './versions/appSettingsVersions';

/** The app settings as the app reads and saves them: the latest version's shape. */
export type AppSettings = LatestAppSettings;

/** Reads and saves the app settings. */
export class AppSettingsStore {
  static async load(): Promise<AppSettings> {
    return AppSettingsPromoter.promoteToLatest(AppSettingsDecodeRouter.decode(await AppSettingsRetriever.retrieveNewestRaw()));
  }

  /** Saves these settings in the latest version, and leaves the rest as saved. In the write queue, like every save. */
  static save(changedAppSettings: Partial<AppSettings>): Promise<void> {
    return queueStorageWrite(async () => {
      const savedValueByKey = Object.entries(encodeAppSettingsV1(changedAppSettings)) as [AppSettingsV1Key, string | null][];
      for (const [appSettingsV1Key, savedValue] of savedValueByKey) {
        if (savedValue === null) {
          await settings.remove(appSettingsV1Key);
        } else {
          await settings.set(appSettingsV1Key, savedValue);
        }
      }
    });
  }
}
