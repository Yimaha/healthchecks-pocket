// Version 2 of the project settings: `projects.v2`, saved by the versions after 0.5.7. Every project has its ping log
// days, and none has a server: the app only talks to healthchecks.io.

import { DEFAULT_PING_LOG_DAYS, isPingLogDays, type PingLogDays } from '@/core/projects/pingLogRange';
import { parseSavedProjectList } from './parseSavedProjectList';

/** One project as version 2 saves it, without its API key. */
export interface SavedProjectV2 {
  id: string;
  name: string;
  readOnly: boolean;
  pingLogDays: PingLogDays;
}

/** The saved projects, in the order the app lists them. */
export type ProjectSettingsV2 = SavedProjectV2[];

/** Throws DamagedProjectList when the list can't be read at all. */
export function decodeProjectSettingsV2(projectSettingsV2Json: string): ProjectSettingsV2 {
  return parseSavedProjectList(projectSettingsV2Json).map(decodeSavedProjectV2);
}

/** Listed field by field, so nothing else saved with it comes along. The name and key kind are read as saved. */
function decodeSavedProjectV2(savedProjectJson: { id: string }): SavedProjectV2 {
  const { id, name, readOnly, pingLogDays } = savedProjectJson as { id: string; name: string; readOnly: boolean; pingLogDays: unknown };
  // Version 2 saves them for every project, so days that aren't one of the choices are damaged: the default.
  return { id, name, readOnly, pingLogDays: isPingLogDays(pingLogDays) ? pingLogDays : DEFAULT_PING_LOG_DAYS };
}
