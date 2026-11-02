import type { AppSettingsV1 } from './appSettingsV1';
import type { AppSettingsV2 } from './appSettingsV2';

/** App settings version 1 (a key each, saved by 0.5.7 and earlier) to version 2 (one object, `appSettings.v2`):
 *  - kept as they were: every setting;
 *  - saved differently: in one object, each under its own name, so the background is no longer saved as `lights`.
 *  Nothing is dropped or added. */
export class AppSettingsV1ToV2Upgrader {
  static readonly fromVersion = 1;
  static readonly toVersion = 2;

  static upgrade(appSettingsV1: AppSettingsV1): AppSettingsV2 {
    // Listed field by field, so a setting version 2 doesn't have can't come along.
    return {
      onboarded: appSettingsV1.onboarded,
      timeZoneChoice: appSettingsV1.timeZoneChoice,
      themeMode: appSettingsV1.themeMode,
      background: appSettingsV1.background,
      pingBodyTextSize: appSettingsV1.pingBodyTextSize,
      pingBodyWrapsLines: appSettingsV1.pingBodyWrapsLines,
      checkForUpdates: appSettingsV1.checkForUpdates,
      skippedUpdateVersion: appSettingsV1.skippedUpdateVersion,
      lastUpdateCheckMs: appSettingsV1.lastUpdateCheckMs,
      openSections: { flips: appSettingsV1.openSections.flips, pings: appSettingsV1.openSections.pings },
      failNextProjectLoad: appSettingsV1.failNextProjectLoad,
    };
  }
}
