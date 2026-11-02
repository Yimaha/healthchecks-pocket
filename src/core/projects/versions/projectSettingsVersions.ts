// Every version of the project settings (the saved project list). Each change to what's saved of a project adds a
// version, saved under a key of its own: the newest one saved is read, and the older ones stay on the device unread.

import type { SettingKey } from '@/core/storage/storage';
import type { ProjectSettingsV1 } from './projectSettingsV1';

/** Every version of the project settings, oldest first. */
export const PROJECT_SETTINGS_VERSIONS = [1] as const;

export type ProjectSettingsVersion = (typeof PROJECT_SETTINGS_VERSIONS)[number];

/** The version this app reads and saves. */
export const LATEST_PROJECT_SETTINGS_VERSION = 1 satisfies ProjectSettingsVersion;

/** The project settings in the shape of the latest version. */
export type LatestProjectSettings = ProjectSettingsV1;

/** Where each version is saved. Version 1 is the `projects` setting as saved from 0.4.0 on, before versions existed. */
export const PROJECT_SETTINGS_KEY_BY_VERSION = {
  1: 'projects',
} as const satisfies Record<ProjectSettingsVersion, SettingKey>;
