// Where the Android app keeps settings: Preferences files, one per group.
// Carried API keys get their own file, so the backup rules can keep them out
// of a Google backup that isn't encrypted on the phone.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Like the Android plugin: calls take effect in the order they're made,
// configure() switches the file for every later call, and each call takes a
// moment to answer, so calls made at once could interleave.
const preferencesFake = vi.hoisted(() => {
  const preferencesFilesByGroup = new Map<string, Map<string, string>>();
  const fake = { configuredGroup: 'CapacitorStorage', preferencesFilesByGroup };
  const fileOfGroup = (preferencesGroup: string) => {
    if (!preferencesFilesByGroup.has(preferencesGroup)) preferencesFilesByGroup.set(preferencesGroup, new Map());
    return preferencesFilesByGroup.get(preferencesGroup)!;
  };
  const nativeDelay = () => new Promise((resolveDelay) => setTimeout(resolveDelay, 0));
  const Preferences = {
    async configure({ group }: { group: string }) {
      fake.configuredGroup = group;
      await nativeDelay();
    },
    async get({ key }: { key: string }) {
      const preferencesFile = fileOfGroup(fake.configuredGroup);
      await nativeDelay();
      return { value: preferencesFile.get(key) ?? null };
    },
    async set({ key, value }: { key: string; value: string }) {
      const preferencesFile = fileOfGroup(fake.configuredGroup);
      await nativeDelay();
      preferencesFile.set(key, value);
    },
    async remove({ key }: { key: string }) {
      const preferencesFile = fileOfGroup(fake.configuredGroup);
      await nativeDelay();
      preferencesFile.delete(key);
    },
    async clear() {
      const preferencesFile = fileOfGroup(fake.configuredGroup);
      await nativeDelay();
      preferencesFile.clear();
    },
  };
  return { fake, fileOfGroup, Preferences };
});

vi.mock('@capacitor/preferences', () => ({ Preferences: preferencesFake.Preferences }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: { setKeyPrefix: async () => {}, clear: async () => {} },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => {} } }));
vi.mock('@capacitor/browser', () => ({ Browser: {} }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: {} }));
vi.mock('@capacitor/share', () => ({ Share: {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, SystemBars: {}, SystemBarsStyle: {} }));

const { nativePlatform } = await import('../../src/platform/native');

const CARRIED_KEYS = 'healthchecks-pocket.carriedKeys';
const THEME = 'healthchecks-pocket.theme';
const settingsFile = () => preferencesFake.fileOfGroup('CapacitorStorage');
const carriedKeysFile = () => preferencesFake.fileOfGroup('CarriedApiKeys');

beforeEach(async () => {
  await nativePlatform.clearAll();
});

describe('native settings storage', () => {
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

  it('a reset empties both files', async () => {
    await nativePlatform.save(CARRIED_KEYS, '{"p1":"key-home"}');
    await nativePlatform.save(THEME, 'dark');
    await nativePlatform.clearAll();
    expect(carriedKeysFile().size).toBe(0);
    expect(settingsFile().size).toBe(0);
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
