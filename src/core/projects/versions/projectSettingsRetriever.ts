import { settings } from '@/core/storage/storage';
import { PROJECT_SETTINGS_KEY_BY_VERSION, PROJECT_SETTINGS_VERSIONS, type ProjectSettingsVersion } from './projectSettingsVersions';

/** The project settings as one version saved them, not yet decoded. */
export interface RawProjectSettings {
  version: ProjectSettingsVersion;
  projectSettingsJson: string;
}

/** Finds the newest version of the project settings saved on this device. */
export class ProjectSettingsRetriever {
  /** The newest version saved, as saved; null when none is (a fresh install). Older versions saved beside it are left
   *  unread, and a version newer than this app's isn't looked for: this app can't read it. */
  static async retrieveNewestRaw(): Promise<RawProjectSettings | null> {
    const versionsNewestFirst = [...PROJECT_SETTINGS_VERSIONS].reverse();
    for (const version of versionsNewestFirst) {
      const projectSettingsJson = await settings.get(PROJECT_SETTINGS_KEY_BY_VERSION[version]);
      if (projectSettingsJson !== null) {
        return { version, projectSettingsJson };
      }
    }
    return null;
  }
}
