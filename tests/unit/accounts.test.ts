import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../src/core/types';

// A platform with separate plain and secret stores, like Android
// (Preferences vs Keystore-encrypted SecureStorage).
const plain = new Map<string, string>();
const secret = new Map<string, string>();
vi.mock('../../src/platform', () => ({
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

const { apiKeyFromPasted, keysDeviceOnly, loadAccounts, newAccountId, saveAccounts, saveActiveProject, setKeysDeviceOnly, withoutInvisibleCharacters } =
  await import('../../src/core/accounts');
const { clearAllSavedData } = await import('../../src/core/storage');
const { platform } = await import('../../src/platform');

const OLD_ACCOUNTS = 'healthchecks-pocket.accounts'; // 0.2/0.3: whole projects, keys included
const PROJECTS = 'healthchecks-pocket.projects';
const ACTIVE = 'healthchecks-pocket.active';
const key = (id: string) => `healthchecks-pocket.apiKey.${id}`;
const homeAccount: Account = { id: 'a1', name: 'Home', baseUrl: 'https://healthchecks.io', apiKey: 'key-one', readOnly: false };
const workAccount: Account = { id: 'a2', name: 'Work', baseUrl: 'https://hc.example.org', apiKey: 'key-two', readOnly: true };
const meta = ({ id, name, baseUrl, readOnly }: Account) => ({ id, name, baseUrl, readOnly });
/** As the secure storage plugin throws: an Error with a StorageErrorType code. */
const storageError = (message: string, code: string) => Object.assign(new Error(message), { code });

beforeEach(() => {
  plain.clear();
  secret.clear();
});

describe('saved projects', () => {
  it('keeps names and servers as settings, and each API key only in secret storage', async () => {
    await saveAccounts([homeAccount, workAccount], 'a2', true);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([meta(homeAccount), meta(workAccount)]);
    expect(secret.get(key('a1'))).toBe('key-one');
    expect(secret.get(key('a2'))).toBe('key-two');
    expect([...plain.values()].join()).not.toContain('key-');
    expect([...secret.keys()].sort()).toEqual([key('a1'), key('a2')]);
    expect(plain.get(ACTIVE)).toBe('a2');
  });

  it('loads what was saved', async () => {
    await saveAccounts([homeAccount, workAccount], 'a2', true);
    expect(await loadAccounts()).toEqual({ accounts: [homeAccount, workAccount], activeId: 'a2' });
  });

  it('deletes the key of a removed project', async () => {
    await saveAccounts([homeAccount, workAccount], 'a1', true);
    await saveAccounts([homeAccount], 'a1', true);
    expect(secret.has(key('a2'))).toBe(false);
  });

  it('lists a project whose key isn\'t on this device (moved phones) with an empty key', async () => {
    plain.set(PROJECTS, JSON.stringify([meta(homeAccount), meta(workAccount)]));
    secret.set(key('a1'), 'key-one');
    expect((await loadAccounts()).accounts).toEqual([homeAccount, { ...workAccount, apiKey: '' }]);
  });

  it('treats a key whose saved value is damaged for good as missing', async () => {
    plain.set(PROJECTS, JSON.stringify([meta(homeAccount)]));
    vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(storageError('Invalid data', 'invalidData'));
    expect((await loadAccounts()).accounts).toEqual([{ ...homeAccount, apiKey: '' }]);
  });

  it('marks a key secure storage failed to read as unreadable, not missing, and saves keep it', async () => {
    await saveAccounts([homeAccount, workAccount], 'a1', true);
    vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(storageError('An OS error occurred (Keystore busy)', 'osError'));
    const { accounts } = await loadAccounts();
    expect(accounts).toEqual([{ ...homeAccount, apiKey: '', apiKeyUnreadable: true }, workAccount]);
    await saveAccounts(accounts, 'a2', true);
    await setKeysDeviceOnly(false, accounts, 'a2');
    expect(secret.get(key('a1'))).toBe('key-one');
  });

  it('saving a project without a key keeps it listed and stores no key', async () => {
    await saveAccounts([{ ...workAccount, apiKey: '' }], 'a2', true);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([meta(workAccount)]);
    expect(secret.size).toBe(0);
  });

  it('falls back to the first project when the saved active one is gone', async () => {
    await saveAccounts([homeAccount], 'a1', true);
    plain.set(ACTIVE, 'deleted');
    expect((await loadAccounts()).activeId).toBe('a1');
  });

  it('starts empty, and survives corrupt data', async () => {
    expect(await loadAccounts()).toEqual({ accounts: [], activeId: null });
    plain.set(PROJECTS, '{not json');
    expect((await loadAccounts()).accounts).toEqual([]);
  });

  it('clears the active project when none is left', async () => {
    await saveAccounts([homeAccount], 'a1', true);
    await saveAccounts([], null, true);
    expect(plain.has(ACTIVE)).toBe(false);
  });
});

describe('projects saved by 0.2/0.3', () => {
  it('aren\'t read: the app starts empty and leaves the old copy unused', async () => {
    secret.set(OLD_ACCOUNTS, JSON.stringify([homeAccount, workAccount]));
    expect(await loadAccounts()).toEqual({ accounts: [], activeId: null });
    expect(plain.has(PROJECTS)).toBe(false);
    expect(secret.has(OLD_ACCOUNTS)).toBe(true);
  });
});

describe('saving safely', () => {
  it('saves the keys before the project list: a key that fails to save leaves the saved list as it was', async () => {
    await saveAccounts([homeAccount], 'a1', true);
    const { platform } = await import('../../src/platform');
    vi.spyOn(platform, 'saveSecret').mockRejectedValueOnce(new Error('Keystore unavailable'));
    await expect(saveAccounts([homeAccount, workAccount], 'a2', true)).rejects.toThrow('Keystore unavailable');
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([meta(homeAccount)]);
  });

  it('skips damaged entries in the saved project list instead of failing to load', async () => {
    plain.set(PROJECTS, JSON.stringify([null, 42, 'text', { name: 'no id' }, meta(homeAccount)]));
    secret.set(key('a1'), 'key-one');
    expect((await loadAccounts()).accounts).toEqual([homeAccount]);
  });

  it('keeps keys the way it is told, without reading the saved choice again', async () => {
    plain.set('healthchecks-pocket.keys.deviceOnly', '0');
    await saveAccounts([homeAccount], 'a1', true);
    expect(secret.get(key('a1'))).toBe('key-one');
    expect(plain.has('healthchecks-pocket.carriedKeys')).toBe(false);
  });

  it('runs saves one at a time, so two at once can\'t leave a removed project\'s key behind', async () => {
    await Promise.all([saveAccounts([homeAccount, workAccount], 'a1', true), saveAccounts([homeAccount], 'a1', true)]);
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([meta(homeAccount)]);
    expect(secret.has(key('a2'))).toBe(false);
  });

  it('a reset waits for a save still running, so the save can\'t write keys back after it', async () => {
    await Promise.all([saveAccounts([homeAccount, workAccount], 'a1', true), clearAllSavedData()]);
    expect(secret.size).toBe(0);
    expect(plain.size).toBe(0);
  });

  it('switching the open project saves only which one opens next time', async () => {
    await saveAccounts([homeAccount, workAccount], 'a1', true);
    const saveSecret = vi.spyOn(platform, 'saveSecret');
    await saveActiveProject('a2');
    expect(plain.get(ACTIVE)).toBe('a2');
    expect(saveSecret).not.toHaveBeenCalled();
  });
});

describe('carrying API keys over (opt-in)', () => {
  const CARRIED = 'healthchecks-pocket.carriedKeys';
  const MODE = 'healthchecks-pocket.keys.deviceOnly';

  it('keeps keys on this device only by default', async () => {
    expect(await keysDeviceOnly()).toBe(true);
    await saveAccounts([homeAccount], 'a1', true);
    expect(plain.has(CARRIED)).toBe(false);
  });

  it('turned off: keys move into the settings (unencrypted) and out of secret storage', async () => {
    await saveAccounts([homeAccount, workAccount], 'a1', true);
    await setKeysDeviceOnly(false, [homeAccount, workAccount], 'a1');
    expect(plain.get(MODE)).toBe('0');
    expect(JSON.parse(plain.get(CARRIED)!)).toEqual({ a1: 'key-one', a2: 'key-two' });
    expect(secret.size).toBe(0);
    expect((await loadAccounts()).accounts).toEqual([homeAccount, workAccount]);
  });

  it('a new phone with carried keys (settings only, no secrets) has every key', async () => {
    plain.set(PROJECTS, JSON.stringify([meta(homeAccount), meta(workAccount)]));
    plain.set(MODE, '0');
    plain.set(CARRIED, JSON.stringify({ a1: 'key-one', a2: 'key-two' }));
    expect((await loadAccounts()).accounts).toEqual([homeAccount, workAccount]);
  });

  it('turned back on: keys move back into secret storage and out of the settings', async () => {
    await setKeysDeviceOnly(false, [homeAccount, workAccount], 'a1');
    await setKeysDeviceOnly(true, [homeAccount, workAccount], 'a1');
    expect(plain.has(CARRIED)).toBe(false);
    expect([...plain.values()].join()).not.toContain('key-');
    expect(secret.get(key('a2'))).toBe('key-two');
  });

  it('saves the new choice only once the keys have moved: a failed move keeps the old one', async () => {
    await saveAccounts([homeAccount, workAccount], 'a1', true);
    const saveToPlainStorage = platform.save;
    vi.spyOn(platform, 'save').mockImplementation(async (storageKey, storedValue) => {
      if (storageKey === CARRIED) throw new Error('Storage full');
      return saveToPlainStorage(storageKey, storedValue);
    });
    await expect(setKeysDeviceOnly(false, [homeAccount, workAccount], 'a1')).rejects.toThrow('Storage full');
    expect(await keysDeviceOnly()).toBe(true);
    expect(secret.get(key('a1'))).toBe('key-one');
  });

  it('uses a carried key when secure storage fails to read', async () => {
    plain.set(PROJECTS, JSON.stringify([meta(homeAccount)]));
    plain.set(CARRIED, JSON.stringify({ a1: 'key-one' }));
    vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(storageError('An unknown error occurred', 'unknownError'));
    expect((await loadAccounts()).accounts).toEqual([homeAccount]);
  });

  it('drops a removed project\'s key from the carried keys', async () => {
    await setKeysDeviceOnly(false, [homeAccount, workAccount], 'a1');
    await saveAccounts([homeAccount], 'a1', false);
    expect(JSON.parse(plain.get(CARRIED)!)).toEqual({ a1: 'key-one' });
  });
});

describe('newAccountId', () => {
  it('makes short unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, newAccountId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{4,8}$/);
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
