import type { RawAppSettings } from './appSettingsRetriever';
import { decodeAppSettingsV1, type AppSettingsV1 } from './appSettingsV1';
import { decodeAppSettingsV2, type AppSettingsV2 } from './appSettingsV2';

/** The app settings decoded into the shape of the version that saved them. */
export type DecodedAppSettings =
  | { version: 1; appSettings: AppSettingsV1 }
  | { version: 2; appSettings: AppSettingsV2 };

/** Sends saved app settings to the decoder of the version that saved them. */
export class AppSettingsDecodeRouter {
  static decode(rawAppSettings: RawAppSettings): DecodedAppSettings {
    switch (rawAppSettings.version) {
      case 1:
        return { version: 1, appSettings: decodeAppSettingsV1(rawAppSettings.savedAppSettingsV1) };
      case 2:
        return { version: 2, appSettings: decodeAppSettingsV2(rawAppSettings.appSettingsV2Json) };
    }
  }
}
