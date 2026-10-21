// Saved projects. A project's name, server and key kind are generic settings
// (carried to a new phone); its API key is a device-only secret, unless the
// user turned "Keep API keys on this device only" off, which keeps keys as a
// plain setting that moves with the others. A project whose key isn't on
// this device (e.g. after moving phones) has apiKey ''.
//
// This is the layout saved from 0.4.0 on. Projects saved by 0.2/0.3 (under
// `healthchecks-pocket.accounts`) aren't read: while in beta, those installs
// start empty and the old copy is left unused.

import { DEFAULT_PING_LOG_DAYS, isPingLogDays, type PingLogDays } from './pingLogRange';
import { queueStorageWrite, SecretReadFailed, secrets, settings } from './storage';
import type { Project, SavedProject } from './types';

export const DEFAULT_BASE_URL = 'https://healthchecks.io';

/** A pasted API key without surrounding spaces and the invisible characters a paste can bring along (zero-width
 *  spaces, byte order marks, soft hyphens, direction marks: Unicode's "format" characters). */
export function withoutInvisibleCharacters(pastedApiKey: string): string {
  return pastedApiKey.replace(/\p{Cf}/gu, '').trim();
}

/** The pasted API key, cleaned, ready to check against the server. Throws if a character that's left can't be in a
 *  key (keys are plain ASCII letters, digits, - and _): `fetch` throws on such a header, which looks like no network. */
export function apiKeyFromPasted(pastedApiKey: string): string {
  const apiKey = withoutInvisibleCharacters(pastedApiKey);
  const unexpectedCharacter = apiKey.match(/[^\x21-\x7e]/u)?.[0];
  if (unexpectedCharacter) {
    throw new Error(`The API key has a character a key can't have ("${unexpectedCharacter}"). Copy it again from healthchecks.io.`);
  }
  return apiKey;
}

/** A project as it's saved, which may be from before a setting existed, or damaged: its settings are checked on reading. */
type UncheckedSavedProject = Omit<SavedProject, 'pingLogDays'> & { pingLogDays?: unknown };

export async function loadProjects(): Promise<{ projects: Project[]; activeProjectId: string | null }> {
  const savedProjectsJson = await settings.get('projects');
  let projects: Project[];
  if (savedProjectsJson === null) {
    // Nothing saved yet: a first launch.
    projects = [];
  } else {
    projects = await withApiKeys(parseSavedProjects(savedProjectsJson));
  }

  const savedActiveProjectId = await settings.get('active');
  let activeProjectId: string | null;
  if (projects.some((project) => project.id === savedActiveProjectId)) {
    // The project open last time is still there: open it again.
    activeProjectId = savedActiveProjectId;
  } else if (projects.length > 0) {
    // It was removed, or none was saved: open the first project.
    activeProjectId = projects[0].id;
  } else {
    activeProjectId = null;
  }
  return { projects, activeProjectId };
}

/** Save the projects and their keys, kept on this device only or with the
 *  settings as `deviceOnly` says. Rejects if any step fails. */
export function saveProjects(projects: Project[], activeProjectId: string | null, deviceOnly: boolean): Promise<void> {
  return queueStorageWrite(() => writeProjects(projects, activeProjectId, deviceOnly));
}

/** Only which project opens next time; the projects and keys stay as saved. */
export function saveActiveProject(activeProjectId: string): Promise<void> {
  return queueStorageWrite(() => settings.set('active', activeProjectId));
}

/** Whether API keys stay encrypted on this device (the default) rather
 *  than moving to a new phone with the settings. */
export async function keysDeviceOnly(): Promise<boolean> {
  return (await settings.get('keys.deviceOnly')) !== '0';
}

/** Switch where API keys are kept: the saved keys move first, then the choice is saved. */
export function setKeysDeviceOnly(deviceOnly: boolean, projects: Project[], activeProjectId: string | null): Promise<void> {
  return queueStorageWrite(async () => {
    await writeProjects(projects, activeProjectId, deviceOnly);
    // Saved last: if moving the keys failed, the saved choice still says where they are.
    await settings.set('keys.deviceOnly', deviceOnly ? '1' : '0');
  });
}

export function hasApiKey(project: Project): boolean {
  return project.apiKey !== '';
}

async function writeProjects(projects: Project[], activeProjectId: string | null, deviceOnly: boolean): Promise<void> {
  const savedProjectsJson = await settings.get('projects');
  let previouslySavedProjects: SavedProject[];
  if (savedProjectsJson === null) {
    previouslySavedProjects = [];
  } else {
    previouslySavedProjects = parseSavedProjects(savedProjectsJson);
  }

  // Keys before the project list, so a failed key write never leaves a saved project without its key.
  if (deviceOnly) {
    for (const project of projects) {
      if (hasApiKey(project)) await secrets.set(`apiKey.${project.id}`, project.apiKey);
    }
  } else {
    const carriedApiKeysByProjectId = Object.fromEntries(projects.filter(hasApiKey).map((project) => [project.id, project.apiKey]));
    await settings.set('carriedKeys', JSON.stringify(carriedApiKeysByProjectId));
  }
  await settings.set('projects', JSON.stringify(projects.map(toSavedProject)));

  // Only now, with the keys saved, delete their copies kept the other way (before "on this device only" was switched).
  if (deviceOnly) {
    await settings.remove('carriedKeys');
  } else {
    for (const project of projects) {
      // A key that couldn't be read isn't carried yet: removing it from secure storage would lose it.
      if (!project.apiKeyUnreadable) await secrets.remove(`apiKey.${project.id}`);
    }
  }
  for (const previouslySavedProject of previouslySavedProjects) {
    const stillSaved = projects.some((project) => project.id === previouslySavedProject.id);
    if (!stillSaved) await secrets.remove(`apiKey.${previouslySavedProject.id}`);
  }

  if (activeProjectId) {
    await settings.set('active', activeProjectId);
  } else {
    await settings.remove('active');
  }
}

/** Without its API key, which is saved apart, or apiKeyUnreadable: the next launch tries to read the key again. */
function toSavedProject({ id, name, baseUrl, readOnly, pingLogDays }: Project): SavedProject {
  return { id, name, baseUrl, readOnly, pingLogDays };
}

/** The saved project list is damaged as a whole (not JSON, or not a list), so none of its projects can be read. */
export class DamagedProjectList extends Error {
  constructor() {
    super('The saved list of projects is damaged and can\'t be read. Reset the app to start again: it also deletes the API keys saved for them.');
  }
}

/** Throws DamagedProjectList rather than reading a damaged list as empty: that would drop every project silently, and
 *  the next save, seeing none, would leave their API keys behind in secure storage for good. */
function parseSavedProjects(savedProjectsJson: string): SavedProject[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(savedProjectsJson);
  } catch {
    throw new DamagedProjectList();
  }
  if (!Array.isArray(parsedJson)) {
    throw new DamagedProjectList();
  }
  // Damaged entries (e.g. null) are dropped: one would otherwise stop every project from loading.
  return parsedJson.filter(hasStringId).map((uncheckedSavedProject) => readSavedProject(uncheckedSavedProject as UncheckedSavedProject));
}

function readSavedProject(uncheckedSavedProject: UncheckedSavedProject): SavedProject {
  let pingLogDays: PingLogDays;
  if (isPingLogDays(uncheckedSavedProject.pingLogDays)) {
    pingLogDays = uncheckedSavedProject.pingLogDays;
  } else {
    // Missing (saved before the setting existed) or not one of the choices (damaged): the default.
    pingLogDays = DEFAULT_PING_LOG_DAYS;
  }
  return { ...uncheckedSavedProject, pingLogDays };
}

function hasStringId(entry: unknown): entry is { id: string } {
  return typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string';
}

async function withApiKeys(savedProjects: SavedProject[]): Promise<Project[]> {
  const carriedApiKeysByProjectId = await loadCarriedApiKeys();
  return Promise.all(savedProjects.map((savedProject) => withApiKey(savedProject, carriedApiKeysByProjectId)));
}

/** A project with its key: from secret storage, else carried over from another phone, else '' (none on this device).
 *  A key secret storage failed to read is marked apiKeyUnreadable, so the app doesn't ask for a key that's still saved. */
async function withApiKey(savedProject: SavedProject, carriedApiKeysByProjectId: Record<string, unknown>): Promise<Project> {
  const carriedApiKey = carriedApiKeysByProjectId[savedProject.id];
  let secretApiKey: string | null;
  try {
    secretApiKey = await secrets.get(`apiKey.${savedProject.id}`);
  } catch (readError) {
    if (!(readError instanceof SecretReadFailed)) throw readError;
    if (typeof carriedApiKey === 'string') {
      return { ...savedProject, apiKey: carriedApiKey };
    }
    return { ...savedProject, apiKey: '', apiKeyUnreadable: true };
  }
  if (secretApiKey !== null) {
    return { ...savedProject, apiKey: secretApiKey };
  } else if (typeof carriedApiKey === 'string') {
    return { ...savedProject, apiKey: carriedApiKey };
  } else {
    return { ...savedProject, apiKey: '' };
  }
}

/** Keys carried over with the settings ("on this device only" off), by project id. */
async function loadCarriedApiKeys(): Promise<Record<string, unknown>> {
  let parsedJson: unknown;
  try {
    const carriedKeysJson = await settings.get('carriedKeys');
    if (carriedKeysJson === null) {
      // None carried: keys are on this device only, the default.
      return {};
    }
    parsedJson = JSON.parse(carriedKeysJson);
  } catch {
    // Can't be read: the projects still load, and ask for their keys.
    return {};
  }
  if (typeof parsedJson === 'object' && parsedJson !== null) {
    return parsedJson as Record<string, unknown>;
  } else {
    return {};
  }
}

/** A random UUID: unlike Math.random(), from a secure source, and too long to repeat. */
export function newProjectId(): string {
  return crypto.randomUUID();
}
