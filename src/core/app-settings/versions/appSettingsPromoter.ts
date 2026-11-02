import type { DecodedAppSettings } from './appSettingsDecodeRouter';
import { AppSettingsV1ToV2Upgrader } from './appSettingsV1ToV2Upgrader';
import { LATEST_APP_SETTINGS_VERSION, type LatestAppSettings } from './appSettingsVersions';

type OlderDecodedAppSettings = Exclude<DecodedAppSettings, { version: typeof LATEST_APP_SETTINGS_VERSION }>;

/** Brings app settings saved by an older version up to the latest, one version at a time. */
export class AppSettingsPromoter {
  static promoteToLatest(decodedAppSettings: DecodedAppSettings): LatestAppSettings {
    let promotedAppSettings = decodedAppSettings;
    while (promotedAppSettings.version !== LATEST_APP_SETTINGS_VERSION) {
      promotedAppSettings = AppSettingsPromoter.promoteOneVersion(promotedAppSettings);
    }
    return promotedAppSettings.appSettings;
  }

  /** One version up, by the upgrader from that version. */
  private static promoteOneVersion(olderAppSettings: OlderDecodedAppSettings): DecodedAppSettings {
    switch (olderAppSettings.version) {
      case AppSettingsV1ToV2Upgrader.fromVersion:
        return { version: AppSettingsV1ToV2Upgrader.toVersion, appSettings: AppSettingsV1ToV2Upgrader.upgrade(olderAppSettings.appSettings) };
    }
  }
}
