// Saved projects. A project's name and key kind are generic settings
// (carried to a new phone); its API key is a device-only secret, unless the
// user turned "Keep API keys on this device only" off, which keeps keys as a
// plain setting that moves with the others. A project whose key isn't on
// this device (e.g. after moving phones) has apiKey ''.
//
// The project list is read in whichever version saved it (./versions), brought up to the latest. Projects saved by
// 0.2/0.3 (under `healthchecks-pocket.accounts`) aren't read: while in beta, those installs start empty and the old
// copy is left unused.

import { queueStorageWrite, SecretReadFailed, secrets, settings } from '@/core/storage/storage';
import type { Project, SavedProject } from './project';
import { ProjectSettingsDecodeRouter } from './versions/projectSettingsDecodeRouter';
import { ProjectSettingsPromoter } from './versions/projectSettingsPromoter';
import { ProjectSettingsRetriever } from './versions/projectSettingsRetriever';
import { LATEST_PROJECT_SETTINGS_VERSION, PROJECT_SETTINGS_KEY_BY_VERSION, type LatestProjectSettings } from './versions/projectSettingsVersions';

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

/** The saved project list in the latest version's shape, whatever version saved it; null when none was ever saved.
 *  Throws DamagedProjectList when it can't be read at all. */
async function readLatestProjectSettings(): Promise<LatestProjectSettings | null> {
  const rawProjectSettings = await ProjectSettingsRetriever.retrieveNewestRaw();
  if (rawProjectSettings === null) {
    return null;
  }
  return ProjectSettingsPromoter.promoteToLatest(ProjectSettingsDecodeRouter.decode(rawProjectSettings));
}

/** Whether a project list was ever saved, in any version: an empty one means every project was removed. */
export async function wereProjectsEverSaved(): Promise<boolean> {
  return (await ProjectSettingsRetriever.retrieveNewestRaw()) !== null;
}

/** When only an older version of the project list is saved, saves it once in the latest version, beside the older one,
 *  which stays as it was. Runs in the write queue, so no save of the projects runs in between. */
export function promoteSavedProjectsToLatestVersion(): Promise<void> {
  return queueStorageWrite(async () => {
    const rawProjectSettings = await ProjectSettingsRetriever.retrieveNewestRaw();
    if (rawProjectSettings === null || rawProjectSettings.version === LATEST_PROJECT_SETTINGS_VERSION) {
      // A fresh install, or promoted already.
      return;
    }
    const decodedProjectSettings = ProjectSettingsDecodeRouter.decode(rawProjectSettings);
    const latestProjectSettings = ProjectSettingsPromoter.promoteToLatest(decodedProjectSettings);
    // The keys of projects an upgrade dropped go first: once the latest version is saved, nothing lists them any more.
    for (const { id: savedProjectId } of decodedProjectSettings.projectSettings) {
      if (!latestProjectSettings.some((latestSavedProject) => latestSavedProject.id === savedProjectId)) {
        await secrets.remove(`apiKey.${savedProjectId}`);
      }
    }
    // Saved last: if a step before it fails, the next launch promotes the older version again.
    await settings.set(PROJECT_SETTINGS_KEY_BY_VERSION[LATEST_PROJECT_SETTINGS_VERSION], JSON.stringify(latestProjectSettings));
  });
}

export async function loadProjects(): Promise<{ projects: Project[]; activeProjectId: string | null }> {
  // Until the launch sequence (#176) runs it before anything reads, the project list is promoted here, as it's first read.
  await promoteSavedProjectsToLatestVersion();
  const latestProjectSettings = await readLatestProjectSettings();
  let projects: Project[];
  if (latestProjectSettings === null) {
    // Nothing saved yet: a first launch.
    projects = [];
  } else {
    projects = await withApiKeys(latestProjectSettings);
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
 *  settings as `keepKeysOnDeviceOnly` says. Rejects if any step fails. */
export function saveProjects(projects: Project[], activeProjectId: string | null, keepKeysOnDeviceOnly: boolean): Promise<void> {
  return queueStorageWrite(() => writeProjects(projects, activeProjectId, keepKeysOnDeviceOnly));
}

/** Only which project opens next time; the projects and keys stay as saved. */
export function saveActiveProject(activeProjectId: string): Promise<void> {
  return queueStorageWrite(() => settings.set('active', activeProjectId));
}

/** "Keep API keys on this device only" as saved: whether keys stay encrypted here (the default) or move with the settings. */
export async function loadKeepKeysOnDeviceOnly(): Promise<boolean> {
  return (await settings.get('keys.deviceOnly')) !== '0';
}

/** Switch where API keys are kept: the saved keys move first, then the choice is saved. */
export function saveKeepKeysOnDeviceOnly(keepKeysOnDeviceOnly: boolean, projects: Project[], activeProjectId: string | null): Promise<void> {
  return queueStorageWrite(async () => {
    await writeProjects(projects, activeProjectId, keepKeysOnDeviceOnly);
    // Saved last: if moving the keys failed, the saved choice still says where they are.
    await settings.set('keys.deviceOnly', keepKeysOnDeviceOnly ? '1' : '0');
  });
}

export function hasApiKey(project: Project): boolean {
  return project.apiKey !== '';
}

async function writeProjects(projects: Project[], activeProjectId: string | null, keepKeysOnDeviceOnly: boolean): Promise<void> {
  const previouslySavedProjects = (await readLatestProjectSettings()) ?? [];

  // Keys before the project list, so a failed key write never leaves a saved project without its key.
  if (keepKeysOnDeviceOnly) {
    for (const project of projects) {
      if (hasApiKey(project)) {
        await secrets.set(`apiKey.${project.id}`, project.apiKey);
      }
    }
  } else {
    const carriedApiKeysByProjectId = Object.fromEntries(projects.filter(hasApiKey).map((project) => [project.id, project.apiKey]));
    await settings.set('carriedKeys', JSON.stringify(carriedApiKeysByProjectId));
  }
  const latestProjectSettings: LatestProjectSettings = projects.map(toSavedProject);
  await settings.set(PROJECT_SETTINGS_KEY_BY_VERSION[LATEST_PROJECT_SETTINGS_VERSION], JSON.stringify(latestProjectSettings));

  // Only now, with the keys saved, delete their copies kept the other way (before "on this device only" was switched).
  if (keepKeysOnDeviceOnly) {
    await settings.remove('carriedKeys');
  } else {
    for (const project of projects) {
      // A key that couldn't be read isn't carried yet: removing it from secure storage would lose it.
      if (!project.apiKeyUnreadable) {
        await secrets.remove(`apiKey.${project.id}`);
      }
    }
  }
  for (const previouslySavedProject of previouslySavedProjects) {
    const stillSaved = projects.some((project) => project.id === previouslySavedProject.id);
    if (!stillSaved) {
      await secrets.remove(`apiKey.${previouslySavedProject.id}`);
    }
  }

  if (activeProjectId) {
    await settings.set('active', activeProjectId);
  } else {
    await settings.remove('active');
  }
}

/** Without its API key, which is saved apart, or apiKeyUnreadable: the next launch tries to read the key again. */
function toSavedProject({ id, name, readOnly, pingLogDays }: Project): SavedProject {
  return { id, name, readOnly, pingLogDays };
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
    if (!(readError instanceof SecretReadFailed)) {
      throw readError;
    }
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
