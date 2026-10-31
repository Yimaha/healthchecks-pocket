import type { DecodedAppSettings } from './appSettingsDecodeRouter';
import type { LatestAppSettings } from './appSettingsVersions';

/** Brings app settings saved by an older version up to the latest, one version at a time. */
export class AppSettingsPromoter {
  static promoteToLatest(decodedAppSettings: DecodedAppSettings): LatestAppSettings {
    // Version 1 is the only version so far: there's nothing to promote it to yet.
    return decodedAppSettings.appSettings;
  }
}
