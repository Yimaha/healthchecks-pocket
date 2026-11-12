// Version 1 of the project settings: the `projects` setting as saved from 0.4.0 on, before versions existed. Its
// projects may be from before a field existed, so the fields added since are checked when they're read.

import { parseSavedProjectList } from './parseSavedProjectList';

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

/** Throws DamagedProjectList when the list can't be read at all. Its projects' fields are checked when upgraded. */
export function decodeProjectSettingsV1(projectSettingsV1Json: string): ProjectSettingsV1 {
  return parseSavedProjectList(projectSettingsV1Json) as ProjectSettingsV1;
}
