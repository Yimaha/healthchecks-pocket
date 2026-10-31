import { HEALTHCHECKS_URL } from '@/core/api/client';
import { DEFAULT_PING_LOG_DAYS, isPingLogDays, type PingLogDays } from '@/core/projects/pingLogRange';
import type { ProjectSettingsV1, SavedProjectV1 } from './projectSettingsV1';
import type { ProjectSettingsV2, SavedProjectV2 } from './projectSettingsV2';

/** Project settings version 1 (`projects`, saved by 0.4.0 to 0.5.7) to version 2 (`projects.v2`):
 *  - kept as they were: `id`, `name` and `readOnly`;
 *  - dropped: `baseUrl`, and every project on a server other than healthchecks.io, so its key never goes there;
 *  - added: `pingLogDays` for a project saved before #111's ping log days, or with days that aren't one of the choices:
 *    the default, 7 days. */
export class ProjectSettingsV1ToV2Upgrader {
  static readonly fromVersion = 1;
  static readonly toVersion = 2;

  static upgrade(projectSettingsV1: ProjectSettingsV1): ProjectSettingsV2 {
    return projectSettingsV1.filter(ProjectSettingsV1ToV2Upgrader.isOnHealthchecksIo).map(ProjectSettingsV1ToV2Upgrader.upgradeSavedProject);
  }

  private static upgradeSavedProject(savedProjectV1: SavedProjectV1): SavedProjectV2 {
    // Listed field by field, so `baseUrl` doesn't come along.
    return {
      id: savedProjectV1.id,
      name: savedProjectV1.name,
      readOnly: savedProjectV1.readOnly,
      pingLogDays: ProjectSettingsV1ToV2Upgrader.computePingLogDays(savedProjectV1),
    };
  }

  /** Saved since self-hosted servers went (no `baseUrl`), or saved on healthchecks.io before that. */
  private static isOnHealthchecksIo({ baseUrl }: SavedProjectV1): boolean {
    if (baseUrl === undefined) {
      return true;
    }
    try {
      return new URL(String(baseUrl)).origin === HEALTHCHECKS_URL;
    } catch {
      return false; // damaged: not a URL
    }
  }

  /** The saved days when they're one of the choices; else the default, 7 days. */
  private static computePingLogDays({ pingLogDays }: SavedProjectV1): PingLogDays {
    return isPingLogDays(pingLogDays) ? pingLogDays : DEFAULT_PING_LOG_DAYS;
  }
}
