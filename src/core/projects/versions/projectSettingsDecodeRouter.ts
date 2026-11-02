import type { RawProjectSettings } from './projectSettingsRetriever';
import { decodeProjectSettingsV1, type ProjectSettingsV1 } from './projectSettingsV1';
import { decodeProjectSettingsV2, type ProjectSettingsV2 } from './projectSettingsV2';

/** The project settings decoded into the shape of the version that saved them. */
export type DecodedProjectSettings =
  | { version: 1; projectSettings: ProjectSettingsV1 }
  | { version: 2; projectSettings: ProjectSettingsV2 };

/** Sends saved project settings to the decoder of the version that saved them. */
export class ProjectSettingsDecodeRouter {
  /** Throws DamagedProjectList when the saved list can't be read at all. */
  static decode(rawProjectSettings: RawProjectSettings): DecodedProjectSettings {
    switch (rawProjectSettings.version) {
      case 1:
        return { version: 1, projectSettings: decodeProjectSettingsV1(rawProjectSettings.projectSettingsJson) };
      case 2:
        return { version: 2, projectSettings: decodeProjectSettingsV2(rawProjectSettings.projectSettingsJson) };
    }
  }
}
