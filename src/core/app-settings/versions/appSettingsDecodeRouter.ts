import type { RawAppSettings } from './appSettingsRetriever';
import { decodeAppSettingsV1, type AppSettingsV1 } from './appSettingsV1';

/** The app settings decoded into the shape of the version that saved them. */
export type DecodedAppSettings = { version: 1; appSettings: AppSettingsV1 };

/** Sends saved app settings to the decoder of the version that saved them. */
export class AppSettingsDecodeRouter {
  static decode(rawAppSettings: RawAppSettings): DecodedAppSettings {
    switch (rawAppSettings.version) {
      case 1:
        return { version: 1, appSettings: decodeAppSettingsV1(rawAppSettings.savedAppSettingsV1) };
    }
  }
}
