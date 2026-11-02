// Version 1 of the project settings: the `projects` setting as saved from 0.4.0 on, before versions existed. Its
// projects may be from before a field existed, so the fields added since are checked when they're read.

import { DamagedProjectList } from './damagedProjectList';

/** One project as version 1 saved it, without its API key. `pingLogDays` is missing when saved before #111's ping log
 *  days; `baseUrl` is the server it's on, saved by 0.5.7 and earlier. */
export interface SavedProjectV1 {
  id: string;
  name: string;
  readOnly: boolean;
  pingLogDays?: unknown;
  baseUrl?: unknown;
}

/** The saved projects, in the order the app lists them. */
export type ProjectSettingsV1 = SavedProjectV1[];

/** Throws DamagedProjectList rather than reading a damaged list as empty: that would drop every project silently, and
 *  the next save, seeing none, would leave their API keys behind in secure storage for good. */
export function decodeProjectSettingsV1(projectSettingsV1Json: string): ProjectSettingsV1 {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(projectSettingsV1Json);
  } catch {
    throw new DamagedProjectList();
  }
  if (!Array.isArray(parsedJson)) {
    throw new DamagedProjectList();
  }
  // Damaged entries (e.g. null) are dropped: one would otherwise stop every project from loading.
  return parsedJson.filter(hasStringId) as ProjectSettingsV1;
}

function hasStringId(entry: unknown): entry is { id: string } {
  return typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string';
}
