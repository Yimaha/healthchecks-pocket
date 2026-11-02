// A project as the app holds it while it runs, and as the latest version of the project settings saves it.

import type { PingLogDays } from './pingLogRange';

/** One healthchecks.io project, reached with one API key. */
export interface Project {
  id: string;
  name: string;
  apiKey: string; // '' when the key isn't on this device (e.g. after moving phones), or couldn't be read
  apiKeyUnreadable?: true; // the key is saved, but secure storage failed to read it at launch
  readOnly: boolean; // read-only keys can't see ping logs or pause checks
  pingLogDays: PingLogDays; // how many days back the ping log reaches
}

/** A project as the latest version of the project settings holds it: without its API key, which is saved apart. */
export type SavedProject = Pick<Project, 'id' | 'name' | 'readOnly' | 'pingLogDays'>;
