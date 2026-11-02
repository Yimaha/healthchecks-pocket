// Every version of the app settings. Each change to how they're saved adds a version: the newest one saved is read,
// and the older ones stay on the device unread.

import type { AppSettingsV2 } from './appSettingsV2';

/** Every version of the app settings, oldest first. */
export const APP_SETTINGS_VERSIONS = [1, 2] as const;

export type AppSettingsVersion = (typeof APP_SETTINGS_VERSIONS)[number];

/** The version this app reads and saves. */
export const LATEST_APP_SETTINGS_VERSION = 2 satisfies AppSettingsVersion;

/** The app settings in the shape of the latest version. */
export type LatestAppSettings = AppSettingsV2;
