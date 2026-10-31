import type { DecodedProjectSettings } from './projectSettingsDecodeRouter';
import { ProjectSettingsV1ToV2Upgrader } from './projectSettingsV1ToV2Upgrader';
import { LATEST_PROJECT_SETTINGS_VERSION, type LatestProjectSettings } from './projectSettingsVersions';

type OlderDecodedProjectSettings = Exclude<DecodedProjectSettings, { version: typeof LATEST_PROJECT_SETTINGS_VERSION }>;

/** Brings project settings saved by an older version up to the latest, one version at a time. */
export class ProjectSettingsPromoter {
  static promoteToLatest(decodedProjectSettings: DecodedProjectSettings): LatestProjectSettings {
    let promotedProjectSettings = decodedProjectSettings;
    while (promotedProjectSettings.version !== LATEST_PROJECT_SETTINGS_VERSION) {
      promotedProjectSettings = ProjectSettingsPromoter.promoteOneVersion(promotedProjectSettings);
    }
    return promotedProjectSettings.projectSettings;
  }

  /** One version up, by the upgrader from that version. */
  private static promoteOneVersion(olderProjectSettings: OlderDecodedProjectSettings): DecodedProjectSettings {
    switch (olderProjectSettings.version) {
      case ProjectSettingsV1ToV2Upgrader.fromVersion:
        return { version: ProjectSettingsV1ToV2Upgrader.toVersion, projectSettings: ProjectSettingsV1ToV2Upgrader.upgrade(olderProjectSettings.projectSettings) };
    }
  }
}
