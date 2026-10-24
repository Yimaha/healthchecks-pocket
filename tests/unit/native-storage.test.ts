// Where the Android app keeps settings and API keys: Preferences files, one per
// group, and Keystore-encrypted secure storage. Carried API keys get their own
// Preferences file, so the backup rules can keep them out of a Google backup
// that isn't encrypted on the phone. Faked plugins stand in for the real ones,
// which only run on a phone (the emulator tests cover those).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pluginFakes = vi.hoisted(() => {
  /** Every plugin call, in order: "Preferences.clear CarriedApiKeys" (with the file it ran in), "SecureStorage.clear healthchecks-pocket." (with the key prefix). */
  const pluginCallLog: string[] = [];
  /** Plugin calls set to fail once, named as in pluginCallLog, with the error each one throws. */
  const failingPluginCalls = new Map<string, Error>();
  const nativeDelay = () => new Promise((resolveDelay) => setTimeout(resolveDelay, 0));
  /** Log a call, answer after a moment like a native plugin, and throw if the test set this call to fail. */
  async function runPluginCall(pluginCallName: string): Promise<void> {
    pluginCallLog.push(pluginCallName);
    await nativeDelay();
    const injectedError = failingPluginCalls.get(pluginCallName);
    if (!injectedError) return;
    failingPluginCalls.delete(pluginCallName);
    throw injectedError;
  }

  // Like the Android plugin: calls take effect in the order they're made,
  // configure() switches the file for every later call, and each call takes a
  // moment to answer, so calls made at once could interleave.
  const preferencesFilesByGroup = new Map<string, Map<string, string>>();
  const preferencesState = { configuredGroup: 'CapacitorStorage' };
  const fileOfGroup = (preferencesGroup: string) => {
    if (!preferencesFilesByGroup.has(preferencesGroup)) preferencesFilesByGroup.set(preferencesGroup, new Map());
    return preferencesFilesByGroup.get(preferencesGroup)!;
  };
  const Preferences = {
    async configure({ group: requestedGroup }: { group: string }) {
      await runPluginCall(`Preferences.configure ${requestedGroup}`);
      preferencesState.configuredGroup = requestedGroup;
    },
    async get({ key: preferenceName }: { key: string }) {
      const preferencesFile = fileOfGroup(preferencesState.configuredGroup);
      await runPluginCall(`Preferences.get ${preferencesState.configuredGroup}`);
      return { value: preferencesFile.get(preferenceName) ?? null };
    },
    async set({ key: preferenceName, value: preferenceText }: { key: string; value: string }) {
      const preferencesFile = fileOfGroup(preferencesState.configuredGroup);
      await runPluginCall(`Preferences.set ${preferencesState.configuredGroup}`);
      preferencesFile.set(preferenceName, preferenceText);
    },
    async remove({ key: preferenceName }: { key: string }) {
      const preferencesFile = fileOfGroup(preferencesState.configuredGroup);
      await runPluginCall(`Preferences.remove ${preferencesState.configuredGroup}`);
      preferencesFile.delete(preferenceName);
    },
    async clear() {
      const preferencesFile = fileOfGroup(preferencesState.configuredGroup);
      await runPluginCall(`Preferences.clear ${preferencesState.configuredGroup}`);
      preferencesFile.clear();
    },
  };

  // Like @aparajita/capacitor-secure-storage: each secret is stored under the
  // key prefix plus its name, get() turns ISO dates into Date unless told not
  // to, and clear() deletes only the names with the current prefix.
  const secretsByStoredName = new Map<string, string>();
  const secureStorageState = { keyPrefix: 'capacitor-storage_' }; // the plugin's default
  const isoDatePattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
  const SecureStorage = {
    async setKeyPrefix(requestedPrefix: string) {
      await runPluginCall(`SecureStorage.setKeyPrefix ${requestedPrefix}`);
      secureStorageState.keyPrefix = requestedPrefix;
    },
    async get(secretName: string, convertDate = true) {
      await runPluginCall(`SecureStorage.get ${secureStorageState.keyPrefix}`);
      const storedSecret = secretsByStoredName.get(secureStorageState.keyPrefix + secretName);
      if (storedSecret === undefined) return null;
      return convertDate && isoDatePattern.test(storedSecret) ? new Date(storedSecret) : storedSecret;
    },
    async set(secretName: string, secretText: string) {
      await runPluginCall(`SecureStorage.set ${secureStorageState.keyPrefix}`);
      secretsByStoredName.set(secureStorageState.keyPrefix + secretName, secretText);
    },
    async remove(secretName: string) {
      await runPluginCall(`SecureStorage.remove ${secureStorageState.keyPrefix}`);
      return secretsByStoredName.delete(secureStorageState.keyPrefix + secretName);
    },
    async clear() {
      await runPluginCall(`SecureStorage.clear ${secureStorageState.keyPrefix}`);
      for (const storedName of [...secretsByStoredName.keys()]) {
        if (storedName.startsWith(secureStorageState.keyPrefix)) secretsByStoredName.delete(storedName);
      }
    },
  };

  return { pluginCallLog, failingPluginCalls, fileOfGroup, secretsByStoredName, Preferences, SecureStorage };
});

vi.mock('@capacitor/preferences', () => ({ Preferences: pluginFakes.Preferences }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: pluginFakes.SecureStorage }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => {} } }));
vi.mock('@capacitor/browser', () => ({ Browser: {} }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: {} }));
vi.mock('@capacitor/share', () => ({ Share: {} }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  SystemBars: {},
  SystemBarsStyle: {},
}));

const { nativePlatform } = await import('@/platform/native');
const { platform } = await import('@/platform');
const { clearAllSavedData, SecretReadFailed, secrets, settings } = await import('@/core/storage');

const CARRIED_KEYS = 'healthchecks-pocket.carriedKeys';
const THEME = 'healthchecks-pocket.theme';
// What phones already have saved: the app's key prefix, then storage.ts's own prefix and name.
const HOME_API_KEY_STORED_NAME = 'healthchecks-pocket.healthchecks-pocket.apiKey.p1';
const settingsFile = () => pluginFakes.fileOfGroup('CapacitorStorage');
const carriedKeysFile = () => pluginFakes.fileOfGroup('CarriedApiKeys');
/** Set a plugin call (named as in pluginCallLog) to fail once with this error. */
const failPluginCallOnce = (pluginCallName: string, injectedError: Error) => pluginFakes.failingPluginCalls.set(pluginCallName, injectedError);
/** As the secure storage plugin throws: an Error with a StorageErrorType code. */
const storageError = (message: string, code: string) => Object.assign(new Error(message), { code });

beforeEach(async () => {
  pluginFakes.failingPluginCalls.clear();
  pluginFakes.secretsByStoredName.clear();
  await nativePlatform.clearAll();
  pluginFakes.pluginCallLog.length = 0;
});

describe('native settings storage', () => {
  it('is the storage a phone uses', () => {
    expect(platform).toBe(nativePlatform);
  });

  it('keeps carried API keys in their own file, and every other setting in the settings file', async () => {
    await nativePlatform.save(CARRIED_KEYS, '{"p1":"key-home"}');
    await nativePlatform.save(THEME, 'dark');
    expect(carriedKeysFile().get(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
    expect(settingsFile().has(CARRIED_KEYS)).toBe(false);
    expect(settingsFile().get(THEME)).toBe('dark');
    expect(await nativePlatform.load(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
    await nativePlatform.remove(CARRIED_KEYS);
    expect(carriedKeysFile().has(CARRIED_KEYS)).toBe(false);
  });

  it("keeps apart the carriedKeys setting that storage.ts saves, under the same name", async () => {
    await settings.set('carriedKeys', '{"p1":"key-home"}');
    expect([...carriedKeysFile().keys()]).toEqual([CARRIED_KEYS]);
    expect(settingsFile().size).toBe(0);
  });

  it('calls made at once each reach their own file', async () => {
    await Promise.all([
      nativePlatform.save(CARRIED_KEYS, '{"p1":"key-home"}'),
      nativePlatform.save(THEME, 'dark'),
      nativePlatform.save(CARRIED_KEYS, '{"p1":"key-home","p2":"key-work"}'),
      nativePlatform.save('healthchecks-pocket.timezone', 'UTC'),
    ]);
    expect([...carriedKeysFile().keys()]).toEqual([CARRIED_KEYS]);
    expect(carriedKeysFile().get(CARRIED_KEYS)).toBe('{"p1":"key-home","p2":"key-work"}');
    expect(settingsFile().has(CARRIED_KEYS)).toBe(false);
    expect(settingsFile().get(THEME)).toBe('dark');
  });

  it('moves carried keys saved by 0.5.3 and older (or restored from their backup) out of the settings file', async () => {
    settingsFile().set(CARRIED_KEYS, '{"p1":"key-home"}');
    expect(await nativePlatform.load(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
    expect(settingsFile().has(CARRIED_KEYS)).toBe(false);
    expect(carriedKeysFile().get(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
  });
});

describe('native secret storage', () => {
  it("keeps each API key in secure storage under the app's key prefix, and none of it in Preferences", async () => {
    await secrets.set('apiKey.p1', 'key-home');
    // Renaming either prefix would lose every API key already saved on a phone.
    expect([...pluginFakes.secretsByStoredName.keys()]).toEqual([HOME_API_KEY_STORED_NAME]);
    expect(pluginFakes.secretsByStoredName.get(HOME_API_KEY_STORED_NAME)).toBe('key-home');
    expect(settingsFile().size + carriedKeysFile().size).toBe(0);
    expect(await secrets.get('apiKey.p1')).toBe('key-home');
    await secrets.remove('apiKey.p1');
    expect(pluginFakes.secretsByStoredName.size).toBe(0);
  });

  it('reads a missing secret as null', async () => {
    expect(await secrets.get('apiKey.p1')).toBeNull();
  });

  it('reads a secret that looks like a date as the text it was saved as', async () => {
    await nativePlatform.saveSecret('healthchecks-pocket.apiKey.p1', '2026-10-17T00:00:00.000Z');
    expect(await nativePlatform.loadSecret('healthchecks-pocket.apiKey.p1')).toBe('2026-10-17T00:00:00.000Z');
  });
});

describe('native reset', () => {
  it("clears the settings file, then the carried keys file, then this app's secrets", async () => {
    await settings.set('theme', 'dark');
    await settings.set('carriedKeys', '{"p1":"key-home"}');
    await secrets.set('apiKey.p1', 'key-home');
    pluginFakes.pluginCallLog.length = 0;
    await clearAllSavedData();
    expect(pluginFakes.pluginCallLog.filter((pluginCallName) => pluginCallName.includes('.clear '))).toEqual([
      'Preferences.clear CapacitorStorage',
      'Preferences.clear CarriedApiKeys',
      'SecureStorage.clear healthchecks-pocket.',
    ]);
    expect(settingsFile().size + carriedKeysFile().size + pluginFakes.secretsByStoredName.size).toBe(0);
  });

  it("leaves other apps' secrets alone", async () => {
    pluginFakes.secretsByStoredName.set('capacitor-storage_other', 'not ours');
    await clearAllSavedData();
    expect([...pluginFakes.secretsByStoredName.keys()]).toEqual(['capacitor-storage_other']);
  });

  it('a step that fails reaches the caller, and the steps after it are left undone', async () => {
    await settings.set('theme', 'dark');
    await settings.set('carriedKeys', '{"p1":"key-home"}');
    await secrets.set('apiKey.p1', 'key-home');
    const carriedKeysClearError = new Error('Preferences file locked');
    failPluginCallOnce('Preferences.clear CarriedApiKeys', carriedKeysClearError);
    await expect(clearAllSavedData()).rejects.toBe(carriedKeysClearError);
    expect(settingsFile().size).toBe(0);
    expect(carriedKeysFile().get(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
    expect(pluginFakes.secretsByStoredName.has(HOME_API_KEY_STORED_NAME)).toBe(true);
  });
});

describe('native storage failures', () => {
  it('a failed settings save or removal reaches the caller and changes nothing', async () => {
    const saveError = new Error('Disk full');
    failPluginCallOnce('Preferences.set CapacitorStorage', saveError);
    await expect(settings.set('theme', 'dark')).rejects.toBe(saveError);
    expect(settingsFile().has(THEME)).toBe(false);

    await settings.set('theme', 'dark');
    const removeError = new Error('Disk full');
    failPluginCallOnce('Preferences.remove CapacitorStorage', removeError);
    await expect(settings.remove('theme')).rejects.toBe(removeError);
    expect(settingsFile().get(THEME)).toBe('dark');
  });

  it('a failed call lets the next one run, in its own file', async () => {
    const carriedKeysSaveError = new Error('Disk full');
    failPluginCallOnce('Preferences.set CarriedApiKeys', carriedKeysSaveError);
    const [carriedKeysSave, themeSave] = await Promise.allSettled([nativePlatform.save(CARRIED_KEYS, '{"p1":"key-home"}'), nativePlatform.save(THEME, 'dark')]);
    expect(carriedKeysSave).toEqual({ status: 'rejected', reason: carriedKeysSaveError });
    expect(themeSave.status).toBe('fulfilled');
    expect(settingsFile().get(THEME)).toBe('dark');
    expect(settingsFile().has(CARRIED_KEYS) || carriedKeysFile().has(CARRIED_KEYS)).toBe(false);
  });

  it('a failed switch to the carried keys file reaches the caller, and nothing goes into the settings file instead', async () => {
    await nativePlatform.save(THEME, 'dark'); // the reset in beforeEach ended in the carried keys file
    const switchError = new Error('Preferences unavailable');
    failPluginCallOnce('Preferences.configure CarriedApiKeys', switchError);
    await expect(nativePlatform.save(CARRIED_KEYS, '{"p1":"key-home"}')).rejects.toBe(switchError);
    expect(settingsFile().has(CARRIED_KEYS)).toBe(false);

    await nativePlatform.save(CARRIED_KEYS, '{"p1":"key-home"}'); // tries the switch again
    expect(carriedKeysFile().get(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
    expect(settingsFile().has(CARRIED_KEYS)).toBe(false);
  });

  it("a move of 0.5.3's carried keys that fails to write them keeps them in the settings file for the next load", async () => {
    settingsFile().set(CARRIED_KEYS, '{"p1":"key-home"}');
    const moveError = new Error('Disk full');
    failPluginCallOnce('Preferences.set CarriedApiKeys', moveError);
    await expect(nativePlatform.load(CARRIED_KEYS)).rejects.toBe(moveError);
    expect(settingsFile().get(CARRIED_KEYS)).toBe('{"p1":"key-home"}');

    expect(await nativePlatform.load(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
    expect(settingsFile().has(CARRIED_KEYS)).toBe(false);
  });

  it("a move of 0.5.3's carried keys that fails to delete the old copy finishes on the next load", async () => {
    settingsFile().set(CARRIED_KEYS, '{"p1":"key-home"}');
    const deleteError = new Error('Disk full');
    failPluginCallOnce('Preferences.remove CapacitorStorage', deleteError);
    await expect(nativePlatform.load(CARRIED_KEYS)).rejects.toBe(deleteError);
    expect(carriedKeysFile().get(CARRIED_KEYS)).toBe('{"p1":"key-home"}');

    expect(await nativePlatform.load(CARRIED_KEYS)).toBe('{"p1":"key-home"}');
    expect(settingsFile().has(CARRIED_KEYS)).toBe(false);
  });

  it("a failed secret read reaches the caller with the plugin's error code", async () => {
    await secrets.set('apiKey.p1', 'key-home');
    failPluginCallOnce('SecureStorage.get healthchecks-pocket.', storageError('An OS error occurred (Keystore busy)', 'osError'));
    await expect(nativePlatform.loadSecret('healthchecks-pocket.apiKey.p1')).rejects.toMatchObject({ code: 'osError' });

    // The code is what lets storage.ts tell a failed read from a damaged secret.
    failPluginCallOnce('SecureStorage.get healthchecks-pocket.', storageError('An OS error occurred (Keystore busy)', 'osError'));
    await expect(secrets.get('apiKey.p1')).rejects.toBeInstanceOf(SecretReadFailed);
    failPluginCallOnce('SecureStorage.get healthchecks-pocket.', storageError('Invalid data', 'invalidData'));
    expect(await secrets.get('apiKey.p1')).toBeNull();
  });

  it('a failed secret save or removal reaches the caller and changes nothing', async () => {
    failPluginCallOnce('SecureStorage.set healthchecks-pocket.', storageError('An OS error occurred (Keystore busy)', 'osError'));
    await expect(secrets.set('apiKey.p1', 'key-home')).rejects.toMatchObject({ code: 'osError' });
    expect(pluginFakes.secretsByStoredName.size).toBe(0);

    await secrets.set('apiKey.p1', 'key-home');
    failPluginCallOnce('SecureStorage.remove healthchecks-pocket.', storageError('An OS error occurred (Keystore busy)', 'osError'));
    await expect(secrets.remove('apiKey.p1')).rejects.toMatchObject({ code: 'osError' });
    expect(pluginFakes.secretsByStoredName.get(HOME_API_KEY_STORED_NAME)).toBe('key-home');
  });
});

describe('Android backup rules', () => {
  const res = resolve(__dirname, '../../android/app/src/main/res');
  const readRules = (path: string) => readFileSync(resolve(res, path), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

  it('Android 12+: cloud backup only when encrypted on the phone; transfer carries settings and carried keys', () => {
    const rules = readRules('xml/data_extraction_rules.xml');
    expect(rules).toContain('<cloud-backup disableIfNoEncryptionCapabilities="true">');
    expect(rules.match(/path="CarriedApiKeys.xml"/g)).toHaveLength(2);
    expect(rules.match(/path="CapacitorStorage.xml"/g)).toHaveLength(2);
  });

  it('Android 9 to 11: carried keys only in a backup encrypted on the phone', () => {
    const rules = readRules('xml-v28/backup_rules.xml');
    expect(rules).toContain('<include domain="sharedpref" path="CarriedApiKeys.xml" requireFlags="clientSideEncryption" />');
    expect(rules).toContain('<include domain="sharedpref" path="CapacitorStorage.xml" />');
  });

  it('Android 7 and 8: no requireFlags, which would stop their backups working', () => {
    const rules = readRules('xml/backup_rules.xml');
    expect(rules).not.toContain('requireFlags');
    expect(rules).toContain('<include domain="sharedpref" path="CarriedApiKeys.xml" />');
  });
});
