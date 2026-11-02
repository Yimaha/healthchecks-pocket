import type { DecodedProjectSettings } from './projectSettingsDecodeRouter';
import type { LatestProjectSettings } from './projectSettingsVersions';

/** Brings project settings saved by an older version up to the latest, one version at a time. */
export class ProjectSettingsPromoter {
  static promoteToLatest(decodedProjectSettings: DecodedProjectSettings): LatestProjectSettings {
    // Version 1 is the only version so far: there's nothing to promote it to yet.
    return decodedProjectSettings.projectSettings;
  }
}
