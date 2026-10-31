import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsV1, SavedAppSettingsV1 } from '@/core/app-settings/versions/appSettingsV1';

const plain = new Map<string, string>();
vi.mock('@/platform', () => ({
  platform: {
    load: async (storageKey: string) => plain.get(storageKey) ?? null,
    save: async (storageKey: string, storedValue: string) => void plain.set(storageKey, storedValue),
    remove: async (storageKey: string) => void plain.delete(storageKey),
  },
}));

const { AppSettingsStore } = await import('@/core/app-settings/appSettingsStore');
const { AppSettingsDecodeRouter } = await import('@/core/app-settings/versions/appSettingsDecodeRouter');
const { AppSettingsPromoter } = await import('@/core/app-settings/versions/appSettingsPromoter');
const { AppSettingsRetriever } = await import('@/core/app-settings/versions/appSettingsRetriever');
const { APP_SETTINGS_V1_KEYS, decodeAppSettingsV1, encodeAppSettingsV1 } = await import('@/core/app-settings/versions/appSettingsV1');
const { APP_SETTINGS_VERSIONS, LATEST_APP_SETTINGS_VERSION } = await import('@/core/app-settings/versions/appSettingsVersions');

const savedV1 = (savedValueByKey: Record<string, string>) => {
  for (const [settingKey, savedValue] of Object.entries(savedValueByKey)) {
    plain.set(`healthchecks-pocket.${settingKey}`, savedValue);
  }
};
const defaultAppSettingsV1: AppSettingsV1 = {
  onboarded: false,
  timeZoneChoice: 'system',
  themeMode: 'dark',
  background: 'breathing',
  pingBodyTextSize: 13,
  pingBodyWrapsLines: true,
  checkForUpdates: true,
  skippedUpdateVersion: null,
  lastUpdateCheckMs: null,
  openSections: { flips: true, pings: true },
  failNextProjectLoad: false,
};
// Every setting changed from its default, as 0.5.7 saves them.
const changedSavedV1 = {
  'onboarded': '1',
  'timezone': 'Europe/Berlin',
  'theme': 'light',
  'lights': 'heartbeat',
  'pingBody.size': '20',
  'pingBody.wrap': '0',
  'updates.enabled': '0',
  'updates.skipped': '0.5.6',
  'updates.lastCheck': '1761800000000',
  'section.flips': '0',
  'section.pings': '1',
  'debug.failNextProjectLoad': '1',
};
const changedAppSettingsV1: AppSettingsV1 = {
  onboarded: true,
  timeZoneChoice: 'Europe/Berlin',
  themeMode: 'light',
  background: 'heartbeat',
  pingBodyTextSize: 20,
  pingBodyWrapsLines: false,
  checkForUpdates: false,
  skippedUpdateVersion: '0.5.6',
  lastUpdateCheckMs: 1761800000000,
  openSections: { flips: false, pings: true },
  failNextProjectLoad: true,
};

beforeEach(() => {
  plain.clear();
});

describe('app settings versions', () => {
  it('are numbered from 1, one after another, ending at the latest', () => {
    expect(APP_SETTINGS_VERSIONS).toEqual(APP_SETTINGS_VERSIONS.map((_, versionIndex) => versionIndex + 1));
    expect(APP_SETTINGS_VERSIONS.at(-1)).toBe(LATEST_APP_SETTINGS_VERSION);
  });

  it('start at version 1: a key each, as saved before versions existed', () => {
    expect(APP_SETTINGS_V1_KEYS).toEqual(Object.keys(changedSavedV1));
  });
});

describe('AppSettingsRetriever', () => {
  it('finds version 1 on a fresh install, with nothing saved', async () => {
    expect(await AppSettingsRetriever.retrieveNewestRaw()).toEqual({ version: 1, savedAppSettingsV1: Object.fromEntries(APP_SETTINGS_V1_KEYS.map((settingKey) => [settingKey, null])) });
  });

  it('finds version 1\'s keys as saved, without decoding them', async () => {
    savedV1(changedSavedV1);
    expect(await AppSettingsRetriever.retrieveNewestRaw()).toEqual({ version: 1, savedAppSettingsV1: changedSavedV1 });
  });
});

describe('AppSettingsDecodeRouter', () => {
  it('decodes version 1 with nothing saved as the defaults', async () => {
    expect(AppSettingsDecodeRouter.decode(await AppSettingsRetriever.retrieveNewestRaw())).toEqual({ version: 1, appSettings: defaultAppSettingsV1 });
  });

  it('decodes each of version 1\'s keys', async () => {
    savedV1(changedSavedV1);
    expect(AppSettingsDecodeRouter.decode(await AppSettingsRetriever.retrieveNewestRaw())).toEqual({ version: 1, appSettings: changedAppSettingsV1 });
  });

  it.each([
    ['theme', 'purple', { themeMode: 'dark' }],
    ['lights', 'disco', { background: 'breathing' }],
    ['pingBody.size', '99', { pingBodyTextSize: 13 }],
    ['pingBody.size', '12.5', { pingBodyTextSize: 13 }],
    ['pingBody.size', '', { pingBodyTextSize: 13 }],
    ['updates.lastCheck', 'yesterday', { lastUpdateCheckMs: null }],
    ['timezone', '', { timeZoneChoice: 'system' }],
    ['onboarded', '', { onboarded: false }],
  ])('reads version 1\'s %s saved as %j, which isn\'t one of its values, as the default', async (settingKey, damagedValue, defaultAppSetting) => {
    savedV1({ [settingKey]: damagedValue });
    expect(AppSettingsDecodeRouter.decode(await AppSettingsRetriever.retrieveNewestRaw()).appSettings).toEqual({ ...defaultAppSettingsV1, ...defaultAppSetting });
  });
});

describe('AppSettingsPromoter', () => {
  it('leaves the latest version as it is', () => {
    expect(AppSettingsPromoter.promoteToLatest({ version: 1, appSettings: changedAppSettingsV1 })).toEqual(changedAppSettingsV1);
  });
});

describe('version 1\'s encoder', () => {
  it('saves each setting as version 1 reads it back', () => {
    const savedAppSettingsV1 = { ...Object.fromEntries(APP_SETTINGS_V1_KEYS.map((settingKey) => [settingKey, null])), ...encodeAppSettingsV1(changedAppSettingsV1) } as SavedAppSettingsV1;
    expect(savedAppSettingsV1).toEqual(changedSavedV1);
    expect(decodeAppSettingsV1(savedAppSettingsV1)).toEqual(changedAppSettingsV1);
  });

  it('saves only the settings given', () => {
    expect(encodeAppSettingsV1({ themeMode: 'light' })).toEqual({ theme: 'light' });
  });
});

describe('AppSettingsStore', () => {
  it('loads the defaults on a fresh install', async () => {
    expect(await AppSettingsStore.load()).toEqual(defaultAppSettingsV1);
  });

  it('saves only what changed, leaving the rest as saved', async () => {
    savedV1({ lights: 'off' });
    await AppSettingsStore.save({ themeMode: 'light' });
    expect(Object.fromEntries(plain)).toEqual({ 'healthchecks-pocket.lights': 'off', 'healthchecks-pocket.theme': 'light' });
    expect(await AppSettingsStore.load()).toEqual({ ...defaultAppSettingsV1, themeMode: 'light', background: 'off' });
  });

  it('removes what has no value to save: no skipped version, a debug failure that\'s been used', async () => {
    savedV1(changedSavedV1);
    await AppSettingsStore.save({ skippedUpdateVersion: null, failNextProjectLoad: false });
    expect(plain.has('healthchecks-pocket.updates.skipped')).toBe(false);
    expect(plain.has('healthchecks-pocket.debug.failNextProjectLoad')).toBe(false);
  });

  it('loads every setting back as saved', async () => {
    await AppSettingsStore.save(changedAppSettingsV1);
    expect(await AppSettingsStore.load()).toEqual(changedAppSettingsV1);
  });
});
