// Saved projects. A project's name, server and key kind are generic settings
// (carried to a new phone); its API key is a device-only secret, unless the
// user turned "Keep API keys on this device only" off, which keeps keys as a
// plain setting that moves with the others. A project whose key isn't on
// this device (e.g. after moving phones) has apiKey ''.
//
// This is the layout saved from 0.4.0 on. Projects saved by 0.2/0.3 (under
// `healthchecks-pocket.accounts`) aren't read: while in beta, those installs
// start empty and the old copy is left unused.

import { queueStorageWrite, SecretReadFailed, secrets, settings } from './storage';
import type { Account } from './types';

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

type Project = Omit<Account, 'apiKey'>;

export async function loadAccounts(): Promise<{ accounts: Account[]; activeId: string | null }> {
  const savedProjectsJson = await settings.get('projects');
  let accounts: Account[];
  if (savedProjectsJson === null) {
    // Nothing saved yet: a first launch.
    accounts = [];
  } else {
    accounts = await withKeys(parse<Project>(savedProjectsJson));
  }

  const savedActiveId = await settings.get('active');
  let activeId: string | null;
  if (accounts.some((account) => account.id === savedActiveId)) {
    // The project open last time is still there: open it again.
    activeId = savedActiveId;
  } else if (accounts.length > 0) {
    // It was removed, or none was saved: open the first project.
    activeId = accounts[0].id;
  } else {
    activeId = null;
  }
  return { accounts, activeId };
}

/** Save the projects and their keys, kept on this device only or with the
 *  settings as `deviceOnly` says. Rejects if any step fails. */
export function saveAccounts(accounts: Account[], activeId: string | null, deviceOnly: boolean): Promise<void> {
  return queueStorageWrite(() => writeAccounts(accounts, activeId, deviceOnly));
}

/** Only which project opens next time; the projects and keys stay as saved. */
export function saveActiveProject(activeId: string): Promise<void> {
  return queueStorageWrite(() => settings.set('active', activeId));
}

/** Whether API keys stay encrypted on this device (the default) rather
 *  than moving to a new phone with the settings. */
export async function keysDeviceOnly(): Promise<boolean> {
  return (await settings.get('keys.deviceOnly')) !== '0';
}

/** Switch where API keys are kept: the saved keys move first, then the choice is saved. */
export function setKeysDeviceOnly(deviceOnly: boolean, accounts: Account[], activeId: string | null): Promise<void> {
  return queueStorageWrite(async () => {
    await writeAccounts(accounts, activeId, deviceOnly);
    // Saved last: if moving the keys failed, the saved choice still says where they are.
    await settings.set('keys.deviceOnly', deviceOnly ? '1' : '0');
  });
}

export function hasKey(account: Account): boolean {
  return account.apiKey !== '';
}

async function writeAccounts(accounts: Account[], activeId: string | null, deviceOnly: boolean): Promise<void> {
  const savedProjectsJson = await settings.get('projects');
  let previouslySavedProjects: Project[];
  if (savedProjectsJson === null) {
    previouslySavedProjects = [];
  } else {
    previouslySavedProjects = parse<Project>(savedProjectsJson);
  }

  // Keys before the project list, so a failed key write never leaves a saved project without its key.
  if (deviceOnly) {
    for (const account of accounts) {
      if (hasKey(account)) await secrets.set(`apiKey.${account.id}`, account.apiKey);
    }
  } else {
    const carriedKeysByProject = Object.fromEntries(accounts.filter(hasKey).map((account) => [account.id, account.apiKey]));
    await settings.set('carriedKeys', JSON.stringify(carriedKeysByProject));
  }
  await settings.set('projects', JSON.stringify(accounts.map(({ id, name, baseUrl, readOnly }) => ({ id, name, baseUrl, readOnly }))));

  // Only now, with the keys saved, delete their copies kept the other way (before "on this device only" was switched).
  if (deviceOnly) {
    await settings.remove('carriedKeys');
  } else {
    for (const account of accounts) {
      // A key that couldn't be read isn't carried yet: removing it from secure storage would lose it.
      if (!account.apiKeyUnreadable) await secrets.remove(`apiKey.${account.id}`);
    }
  }
  for (const previouslySavedProject of previouslySavedProjects) {
    const stillSaved = accounts.some((account) => account.id === previouslySavedProject.id);
    if (!stillSaved) await secrets.remove(`apiKey.${previouslySavedProject.id}`);
  }

  if (activeId) {
    await settings.set('active', activeId);
  } else {
    await settings.remove('active');
  }
}

function parse<T extends { id: string }>(savedJson: string): T[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(savedJson);
  } catch {
    // Not JSON: nothing in it can be read.
    return [];
  }
  if (!Array.isArray(parsedJson)) {
    return [];
  }
  // Damaged entries (e.g. null) are dropped: one would otherwise stop every project from loading.
  return parsedJson.filter(hasStringId) as T[];
}

function hasStringId(entry: unknown): entry is { id: string } {
  return typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string';
}

async function withKeys(projects: Project[]): Promise<Account[]> {
  const carriedKeysByProject = await loadCarriedKeys();
  return Promise.all(projects.map((project) => withApiKey(project, carriedKeysByProject)));
}

/** A project with its key: from secret storage, else carried over from another phone, else '' (none on this device).
 *  A key secret storage failed to read is marked apiKeyUnreadable, so the app doesn't ask for a key that's still saved. */
async function withApiKey(project: Project, carriedKeysByProject: Record<string, unknown>): Promise<Account> {
  const carriedApiKey = carriedKeysByProject[project.id];
  let secretApiKey: string | null;
  try {
    secretApiKey = await secrets.get(`apiKey.${project.id}`);
  } catch (readError) {
    if (!(readError instanceof SecretReadFailed)) throw readError;
    if (typeof carriedApiKey === 'string') {
      return { ...project, apiKey: carriedApiKey };
    }
    return { ...project, apiKey: '', apiKeyUnreadable: true };
  }
  if (secretApiKey !== null) {
    return { ...project, apiKey: secretApiKey };
  } else if (typeof carriedApiKey === 'string') {
    return { ...project, apiKey: carriedApiKey };
  } else {
    return { ...project, apiKey: '' };
  }
}

/** Keys carried over with the settings ("on this device only" off), by project id. */
async function loadCarriedKeys(): Promise<Record<string, unknown>> {
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

export function newAccountId(): string {
  return Math.random().toString(36).slice(2, 10);
}
