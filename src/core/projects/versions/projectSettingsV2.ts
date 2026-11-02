// Version 2 of the project settings: `projects.v2`, saved by the versions after 0.5.7. Every project has its ping log
// days, and none has a server: the app only talks to healthchecks.io.

import { DEFAULT_PING_LOG_DAYS, isPingLogDays, type PingLogDays } from '@/core/projects/pingLogRange';
import { DamagedProjectList } from './damagedProjectList';

/** One project as version 2 saves it, without its API key. */
export interface SavedProjectV2 {
  id: string;
  name: string;
  readOnly: boolean;
  pingLogDays: PingLogDays;
}

/** The saved projects, in the order the app lists them. */
export type ProjectSettingsV2 = SavedProjectV2[];

/** Throws DamagedProjectList rather than reading a damaged list as empty: that would drop every project silently, and
 *  the next save, seeing none, would leave their API keys behind in secure storage for good. */
export function decodeProjectSettingsV2(projectSettingsV2Json: string): ProjectSettingsV2 {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(projectSettingsV2Json);
  } catch {
    throw new DamagedProjectList();
  }
  if (!Array.isArray(parsedJson)) {
    throw new DamagedProjectList();
  }
  // Damaged entries (e.g. null) are dropped: one would otherwise stop every project from loading.
  return parsedJson.filter(hasStringId).map(decodeSavedProjectV2);
}

/** Listed field by field, so nothing else saved with it comes along. The name and key kind are read as saved. */
function decodeSavedProjectV2(savedProjectJson: { id: string }): SavedProjectV2 {
  const { id, name, readOnly, pingLogDays } = savedProjectJson as { id: string; name: string; readOnly: boolean; pingLogDays: unknown };
  // Version 2 saves them for every project, so days that aren't one of the choices are damaged: the default.
  return { id, name, readOnly, pingLogDays: isPingLogDays(pingLogDays) ? pingLogDays : DEFAULT_PING_LOG_DAYS };
}

function hasStringId(entry: unknown): entry is { id: string } {
  return typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string';
}
