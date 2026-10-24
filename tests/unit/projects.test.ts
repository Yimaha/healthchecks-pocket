import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, SavedProject } from '@/core/projects/project';

// A platform with separate plain and secret stores, like Android
// (Preferences vs Keystore-encrypted SecureStorage).
const plain = new Map<string, string>();
const secret = new Map<string, string>();
vi.mock('@/platform', () => ({
  platform: {
    load: async (key: string) => plain.get(key) ?? null,
    save: async (key: string, value: string) => void plain.set(key, value),
    remove: async (key: string) => void plain.delete(key),
    loadSecret: async (key: string) => secret.get(key) ?? null,
    saveSecret: async (key: string, value: string) => void secret.set(key, value),
    removeSecret: async (key: string) => void secret.delete(key),
    clearAll: async () => {
      plain.clear();
      secret.clear();
    },
    openExternal: () => {},
    secretProtection: 'keystore',
  },
}));

const { apiKeyFromPasted, DamagedProjectList, loadKeepKeysOnDeviceOnly, loadProjects, newProjectId, saveActiveProject, saveKeepKeysOnDeviceOnly, saveProjects, withoutInvisibleCharacters } =
  await import('@/core/projects/savedProjects');
const { clearAllSavedData } = await import('@/core/storage/storage');
const { platform } = await import('@/platform');

const OLD_ACCOUNTS = 'healthchecks-pocket.accounts'; // 0.2/0.3: whole projects, keys included
const PROJECTS = 'healthchecks-pocket.projects';
const ACTIVE = 'healthchecks-pocket.active';
const key = (id: string) => `healthchecks-pocket.apiKey.${id}`;
const homeProject: Project = { id: 'a1', name: 'Home', apiKey: 'key-one', readOnly: false, pingLogDays: 7 };
const workProject: Project = { id: 'a2', name: 'Work', apiKey: 'key-two', readOnly: true, pingLogDays: 30 };
const asSavedProject = ({ id, name, readOnly, pingLogDays }: Project): SavedProject => ({ id, name, readOnly, pingLogDays });
/** As the secure storage plugin throws: an Error with a StorageErrorType code. */
const storageError = (message: string, code: string) => Object.assign(new Error(message), { code });

beforeEach(() => {
  plain.clear();
  secret.clear();
});

describe('saved projects', () => {
  it('keeps projects as settings, and each API key only in secret storage', async () => {
    await saveProjects([homeProject, workProject], 'a2', true);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([asSavedProject(homeProject), asSavedProject(workProject)]);
    expect(secret.get(key('a1'))).toBe('key-one');
    expect(secret.get(key('a2'))).toBe('key-two');
    expect([...plain.values()].join()).not.toContain('key-');
    expect([...secret.keys()].sort()).toEqual([key('a1'), key('a2')]);
    expect(plain.get(ACTIVE)).toBe('a2');
  });

  it('loads what was saved', async () => {
    await saveProjects([homeProject, workProject], 'a2', true);
    expect(await loadProjects()).toEqual({ projects: [homeProject, workProject], activeProjectId: 'a2' });
  });

  it('deletes the key of a removed project', async () => {
    await saveProjects([homeProject, workProject], 'a1', true);
    await saveProjects([homeProject], 'a1', true);
    expect(secret.has(key('a2'))).toBe(false);
  });

  it('lists a project whose key isn\'t on this device (moved phones) with an empty key', async () => {
    plain.set(PROJECTS, JSON.stringify([asSavedProject(homeProject), asSavedProject(workProject)]));
    secret.set(key('a1'), 'key-one');
    expect((await loadProjects()).projects).toEqual([homeProject, { ...workProject, apiKey: '' }]);
  });

  it('treats a key whose saved value is damaged for good as missing', async () => {
    plain.set(PROJECTS, JSON.stringify([asSavedProject(homeProject)]));
    vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(storageError('Invalid data', 'invalidData'));
    expect((await loadProjects()).projects).toEqual([{ ...homeProject, apiKey: '' }]);
  });

  it('marks a key secure storage failed to read as unreadable, not missing, and saves keep it', async () => {
    await saveProjects([homeProject, workProject], 'a1', true);
    vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(storageError('An OS error occurred (Keystore busy)', 'osError'));
    const { projects } = await loadProjects();
    expect(projects).toEqual([{ ...homeProject, apiKey: '', apiKeyUnreadable: true }, workProject]);
    await saveProjects(projects, 'a2', true);
    await saveKeepKeysOnDeviceOnly(false, projects, 'a2');
    expect(secret.get(key('a1'))).toBe('key-one');
  });

  it('saving a project without a key keeps it listed and stores no key', async () => {
    await saveProjects([{ ...workProject, apiKey: '' }], 'a2', true);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([asSavedProject(workProject)]);
    expect(secret.size).toBe(0);
  });

  it('falls back to the first project when the saved active one is gone', async () => {
    await saveProjects([homeProject], 'a1', true);
    plain.set(ACTIVE, 'deleted');
    expect((await loadProjects()).activeProjectId).toBe('a1');
  });

  it('gives projects saved before the ping log setting existed the default of 7 days', async () => {
    const { pingLogDays: _, ...savedBeforePingLogDays } = asSavedProject(workProject);
    plain.set(PROJECTS, JSON.stringify([savedBeforePingLogDays]));
    expect((await loadProjects()).projects[0].pingLogDays).toBe(7);
  });

  it.each([45, 0, 7.5, '14', null])('reads saved ping log days that aren\'t one of the choices (%j) back as the default of 7 days', async (damagedPingLogDays) => {
    plain.set(PROJECTS, JSON.stringify([{ ...asSavedProject(workProject), pingLogDays: damagedPingLogDays }]));
    expect((await loadProjects()).projects[0].pingLogDays).toBe(7);
  });

  it('starts empty', async () => {
    expect(await loadProjects()).toEqual({ projects: [], activeProjectId: null });
  });

  it.each(['{not json', '{"id":"a1"}', 'null', '"text"'])('says a damaged project list (%s) is damaged, instead of loading it as empty', async (damagedProjectsJson) => {
    plain.set(PROJECTS, damagedProjectsJson);
    secret.set(key('a1'), 'key-one');
    await expect(loadProjects()).rejects.toThrow(DamagedProjectList);
    // A save over it fails too, rather than overwriting the list and leaving its projects' keys behind.
    await expect(saveProjects([workProject], 'a2', true)).rejects.toThrow(DamagedProjectList);
    expect(plain.get(PROJECTS)).toBe(damagedProjectsJson);
    expect(secret.get(key('a1'))).toBe('key-one');
  });

  it('clears the active project when none is left', async () => {
    await saveProjects([homeProject], 'a1', true);
    await saveProjects([], null, true);
    expect(plain.has(ACTIVE)).toBe(false);
  });
});

describe('projects saved by 0.2/0.3', () => {
  it('aren\'t read: the app starts empty and leaves the old copy unused', async () => {
    secret.set(OLD_ACCOUNTS, JSON.stringify([homeProject, workProject]));
    expect(await loadProjects()).toEqual({ projects: [], activeProjectId: null });
    expect(plain.has(PROJECTS)).toBe(false);
    expect(secret.has(OLD_ACCOUNTS)).toBe(true);
  });
});

describe('projects saved by 0.5.7 and earlier, each with its server', () => {
  const savedWithServer = (project: Project, baseUrl: unknown) => ({ ...asSavedProject(project), baseUrl });

  it.each(['https://healthchecks.io', 'https://healthchecks.io/'])('load when on healthchecks.io (%s), and are saved again without the server', async (baseUrl) => {
    plain.set(PROJECTS, JSON.stringify([savedWithServer(homeProject, baseUrl)]));
    secret.set(key('a1'), 'key-one');
    const { projects } = await loadProjects();
    expect(projects).toEqual([homeProject]);
    await saveProjects(projects, 'a1', true);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([asSavedProject(homeProject)]);
  });

  it.each(['https://hc.example.org', 'http://healthchecks.io', 'not a url', null])('are left out when on another server (%j), so their keys never go to healthchecks.io, and the next save deletes the keys', async (baseUrl) => {
    plain.set(PROJECTS, JSON.stringify([savedWithServer(workProject, baseUrl), savedWithServer(homeProject, 'https://healthchecks.io')]));
    plain.set(ACTIVE, 'a2');
    secret.set(key('a1'), 'key-one');
    secret.set(key('a2'), 'key-two');
    const { projects, activeProjectId } = await loadProjects();
    expect({ projects, activeProjectId }).toEqual({ projects: [homeProject], activeProjectId: 'a1' });
    await saveProjects(projects, activeProjectId, true);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([asSavedProject(homeProject)]);
    expect(secret.has(key('a2'))).toBe(false);
  });

  it('a carried key of one left out goes on the next save too', async () => {
    plain.set(PROJECTS, JSON.stringify([savedWithServer(workProject, 'https://hc.example.org'), asSavedProject(homeProject)]));
    plain.set('healthchecks-pocket.carriedKeys', JSON.stringify({ a1: 'key-one', a2: 'key-two' }));
    const { projects } = await loadProjects();
    expect(projects).toEqual([homeProject]);
    await saveProjects(projects, 'a1', false);
    expect(JSON.parse(plain.get('healthchecks-pocket.carriedKeys')!)).toEqual({ a1: 'key-one' });
  });
});

describe('saving safely', () => {
  it('saves the keys before the project list: a key that fails to save leaves the saved list as it was', async () => {
    await saveProjects([homeProject], 'a1', true);
    const { platform } = await import('@/platform');
    vi.spyOn(platform, 'saveSecret').mockRejectedValueOnce(new Error('Keystore unavailable'));
    await expect(saveProjects([homeProject, workProject], 'a2', true)).rejects.toThrow('Keystore unavailable');
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([asSavedProject(homeProject)]);
  });

  it('skips damaged entries in the saved project list instead of failing to load', async () => {
    plain.set(PROJECTS, JSON.stringify([null, 42, 'text', { name: 'no id' }, asSavedProject(homeProject)]));
    secret.set(key('a1'), 'key-one');
    expect((await loadProjects()).projects).toEqual([homeProject]);
  });

  it('keeps keys the way it is told, without reading the saved choice again', async () => {
    plain.set('healthchecks-pocket.keys.deviceOnly', '0');
    await saveProjects([homeProject], 'a1', true);
    expect(secret.get(key('a1'))).toBe('key-one');
    expect(plain.has('healthchecks-pocket.carriedKeys')).toBe(false);
  });

  it('runs saves one at a time, so two at once can\'t leave a removed project\'s key behind', async () => {
    await Promise.all([saveProjects([homeProject, workProject], 'a1', true), saveProjects([homeProject], 'a1', true)]);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([asSavedProject(homeProject)]);
    expect(secret.has(key('a2'))).toBe(false);
  });

  it('a reset waits for a save still running, so the save can\'t write keys back after it', async () => {
    await Promise.all([saveProjects([homeProject, workProject], 'a1', true), clearAllSavedData()]);
    expect(secret.size).toBe(0);
    expect(plain.size).toBe(0);
  });

  it('switching the open project saves only which one opens next time', async () => {
    await saveProjects([homeProject, workProject], 'a1', true);
    const saveSecret = vi.spyOn(platform, 'saveSecret');
    await saveActiveProject('a2');
    expect(plain.get(ACTIVE)).toBe('a2');
    expect(saveSecret).not.toHaveBeenCalled();
  });
});

describe('carrying API keys over (opt-in)', () => {
  const CARRIED = 'healthchecks-pocket.carriedKeys';
  const KEEP_KEYS_ON_DEVICE_ONLY = 'healthchecks-pocket.keys.deviceOnly';

  it('keeps keys on this device only by default', async () => {
    expect(await loadKeepKeysOnDeviceOnly()).toBe(true);
    await saveProjects([homeProject], 'a1', true);
    expect(plain.has(CARRIED)).toBe(false);
  });

  it('turned off: keys move into the settings (unencrypted) and out of secret storage', async () => {
    await saveProjects([homeProject, workProject], 'a1', true);
    await saveKeepKeysOnDeviceOnly(false, [homeProject, workProject], 'a1');
    expect(plain.get(KEEP_KEYS_ON_DEVICE_ONLY)).toBe('0');
    expect(JSON.parse(plain.get(CARRIED)!)).toEqual({ a1: 'key-one', a2: 'key-two' });
    expect(secret.size).toBe(0);
    expect((await loadProjects()).projects).toEqual([homeProject, workProject]);
  });

  it('a new phone with carried keys (settings only, no secrets) has every key', async () => {
    plain.set(PROJECTS, JSON.stringify([asSavedProject(homeProject), asSavedProject(workProject)]));
    plain.set(KEEP_KEYS_ON_DEVICE_ONLY, '0');
    plain.set(CARRIED, JSON.stringify({ a1: 'key-one', a2: 'key-two' }));
    expect((await loadProjects()).projects).toEqual([homeProject, workProject]);
  });

  it('turned back on: keys move back into secret storage and out of the settings', async () => {
    await saveKeepKeysOnDeviceOnly(false, [homeProject, workProject], 'a1');
    await saveKeepKeysOnDeviceOnly(true, [homeProject, workProject], 'a1');
    expect(plain.has(CARRIED)).toBe(false);
    expect([...plain.values()].join()).not.toContain('key-');
    expect(secret.get(key('a2'))).toBe('key-two');
  });

  it('saves the new choice only once the keys have moved: a failed move keeps the old one', async () => {
    await saveProjects([homeProject, workProject], 'a1', true);
    const saveToPlainStorage = platform.save;
    vi.spyOn(platform, 'save').mockImplementation(async (storageKey, storedValue) => {
      if (storageKey === CARRIED) throw new Error('Storage full');
      return saveToPlainStorage(storageKey, storedValue);
    });
    await expect(saveKeepKeysOnDeviceOnly(false, [homeProject, workProject], 'a1')).rejects.toThrow('Storage full');
    expect(await loadKeepKeysOnDeviceOnly()).toBe(true);
    expect(secret.get(key('a1'))).toBe('key-one');
  });

  it('uses a carried key when secure storage fails to read', async () => {
    plain.set(PROJECTS, JSON.stringify([asSavedProject(homeProject)]));
    plain.set(CARRIED, JSON.stringify({ a1: 'key-one' }));
    vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(storageError('An unknown error occurred', 'unknownError'));
    expect((await loadProjects()).projects).toEqual([homeProject]);
  });

  it('drops a removed project\'s key from the carried keys', async () => {
    await saveKeepKeysOnDeviceOnly(false, [homeProject, workProject], 'a1');
    await saveProjects([homeProject], 'a1', false);
    expect(JSON.parse(plain.get(CARRIED)!)).toEqual({ a1: 'key-one' });
  });

  it.each(['{not json', 'null', '"text"'])('still loads the projects when the carried keys are damaged (%s), asking for their keys', async (damagedCarriedKeysJson) => {
    plain.set(PROJECTS, JSON.stringify([asSavedProject(homeProject)]));
    plain.set(CARRIED, damagedCarriedKeysJson);
    expect((await loadProjects()).projects).toEqual([{ ...homeProject, apiKey: '' }]);
  });
});

describe('newProjectId', () => {
  it('makes random UUIDs with crypto.randomUUID, not Math.random', () => {
    const mathRandom = vi.spyOn(Math, 'random');
    const ids = new Set(Array.from({ length: 200 }, newProjectId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(mathRandom).not.toHaveBeenCalled();
  });
});

describe('pasted API keys', () => {
  it('drops surrounding spaces and invisible characters anywhere', () => {
    expect(withoutInvisibleCharacters(' \u00a0\ufeffab\u200bc\u200d-\u2060d_\u202ae\n')).toBe('abc-d_e');
    expect(apiKeyFromPasted('\u200bAbC-123_xyz\u200b')).toBe('AbC-123_xyz');
  });

  it.each([['ké', 'é'], ['k\u00a0k', '\u00a0'], ['k k', ' '], ['k\u2013k', '\u2013'], ['k😀', '😀']])(
    'refuses %j, naming %j',
    (pastedApiKey, unexpectedCharacter) => expect(() => apiKeyFromPasted(pastedApiKey)).toThrow(`("${unexpectedCharacter}")`),
  );
});
