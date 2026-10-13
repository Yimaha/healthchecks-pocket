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
    openExternal: () => {},
    secretProtection: 'keystore',
  },
}));

const { keysDeviceOnly, loadAccounts, newAccountId, saveAccounts, setKeysDeviceOnly } = await import('../../src/core/accounts');

const LEGACY = 'healthchecks-pocket.accounts';
const PROJECTS = 'healthchecks-pocket.projects';
const ACTIVE = 'healthchecks-pocket.active';
const key = (id: string) => `healthchecks-pocket.apiKey.${id}`;
const homeAccount: Account = { id: 'a1', name: 'Home', baseUrl: 'https://healthchecks.io', apiKey: 'key-one', readOnly: false };
const workAccount: Account = { id: 'a2', name: 'Work', baseUrl: 'https://hc.example.org', apiKey: 'key-two', readOnly: true };
const meta = ({ id, name, baseUrl, readOnly }: Account) => ({ id, name, baseUrl, readOnly });

beforeEach(() => {
  plain.clear();
  secret.clear();
});

describe('saved projects', () => {
  it('keeps names and servers as settings, and each API key only in secret storage', async () => {
    await saveAccounts([homeAccount, workAccount], 'a2');
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([meta(homeAccount), meta(workAccount)]);
    expect(secret.get(key('a1'))).toBe('key-one');
    expect(secret.get(key('a2'))).toBe('key-two');
    expect([...plain.values()].join()).not.toContain('key-');
    expect([...secret.keys()].sort()).toEqual([key('a1'), key('a2')]);
    expect(plain.get(ACTIVE)).toBe('a2');
  });

  it('loads what was saved', async () => {
    await saveAccounts([homeAccount, workAccount], 'a2');
    expect(await loadAccounts()).toEqual({ accounts: [homeAccount, workAccount], activeId: 'a2' });
  });

  it('deletes the key of a removed project', async () => {
    await saveAccounts([homeAccount, workAccount], 'a1');
    await saveAccounts([homeAccount], 'a1');
    expect(secret.has(key('a2'))).toBe(false);
  });

  it('lists a project whose key isn\'t on this device (moved phones) with an empty key', async () => {
    plain.set(PROJECTS, JSON.stringify([meta(homeAccount), meta(workAccount)]));
    secret.set(key('a1'), 'key-one');
    expect((await loadAccounts()).accounts).toEqual([homeAccount, { ...workAccount, apiKey: '' }]);
  });

  it('treats a key that can\'t be decrypted as missing', async () => {
    plain.set(PROJECTS, JSON.stringify([meta(homeAccount)]));
    const { platform } = await import('../../src/platform');
    vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(new Error('bad padding'));
    expect((await loadAccounts()).accounts).toEqual([{ ...homeAccount, apiKey: '' }]);
  });

  it('saving a project without a key keeps it listed and stores no key', async () => {
    await saveAccounts([{ ...workAccount, apiKey: '' }], 'a2');
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([meta(workAccount)]);
    expect(secret.size).toBe(0);
  });

  it('falls back to the first project when the saved active one is gone', async () => {
    await saveAccounts([homeAccount], 'a1');
    plain.set(ACTIVE, 'deleted');
    expect((await loadAccounts()).activeId).toBe('a1');
  });

  it('starts empty, and survives corrupt data', async () => {
    expect(await loadAccounts()).toEqual({ accounts: [], activeId: null });
    plain.set(PROJECTS, '{not json');
    expect((await loadAccounts()).accounts).toEqual([]);
  });

  it('clears the active project when none is left', async () => {
    await saveAccounts([homeAccount], 'a1');
    await saveAccounts([], null);
    expect(plain.has(ACTIVE)).toBe(false);
  });
});

describe('migration from older builds', () => {
  it('splits 0.2/0.3 projects (whole, in secret storage) into settings and per-project keys', async () => {
    secret.set(LEGACY, JSON.stringify([homeAccount, workAccount]));
    plain.set(ACTIVE, 'a2');
    expect(await loadAccounts()).toEqual({ accounts: [homeAccount, workAccount], activeId: 'a2' });
    expect(JSON.parse(plain.get(PROJECTS)!)).toEqual([meta(homeAccount), meta(workAccount)]);
    expect(secret.get(key('a2'))).toBe('key-two');
    expect(secret.has(LEGACY)).toBe(false);
  });

  it('moves projects from plain storage (before 0.2) and deletes the plain copy', async () => {
    plain.set(LEGACY, JSON.stringify([homeAccount]));
    plain.set(ACTIVE, 'a1');
    expect(await loadAccounts()).toEqual({ accounts: [homeAccount], activeId: 'a1' });
    expect(secret.get(key('a1'))).toBe('key-one');
    expect(plain.has(LEGACY)).toBe(false);
    expect([...plain.values()].join()).not.toContain('key-');
  });

  it('prefers secret storage when both old copies exist, and deletes both', async () => {
    secret.set(LEGACY, JSON.stringify([workAccount]));
    plain.set(LEGACY, JSON.stringify([homeAccount]));
    expect((await loadAccounts()).accounts).toEqual([workAccount]);
    expect(plain.has(LEGACY) || secret.has(LEGACY)).toBe(false);
  });

  it('runs only once', async () => {
    secret.set(LEGACY, JSON.stringify([homeAccount]));
    await loadAccounts();
    secret.set(LEGACY, JSON.stringify([workAccount]));
    expect((await loadAccounts()).accounts).toEqual([homeAccount]);
  });
});

describe('carrying API keys over (opt-in)', () => {
  const CARRIED = 'healthchecks-pocket.carriedKeys';
  const MODE = 'healthchecks-pocket.keys.deviceOnly';

  it('keeps keys on this device only by default', async () => {
    expect(await keysDeviceOnly()).toBe(true);
    await saveAccounts([homeAccount], 'a1');
    expect(plain.has(CARRIED)).toBe(false);
  });

  it('turned off: keys move into the settings (unencrypted) and out of secret storage', async () => {
    await saveAccounts([homeAccount, workAccount], 'a1');
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

  it('drops a removed project\'s key from the carried keys', async () => {
    await setKeysDeviceOnly(false, [homeAccount, workAccount], 'a1');
    await saveAccounts([homeAccount], 'a1');
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
