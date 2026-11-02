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
const { APP_SETTINGS_V1_KEYS } = await import('@/core/app-settings/versions/appSettingsV1');
const { AppSettingsV1ToV2Upgrader } = await import('@/core/app-settings/versions/appSettingsV1ToV2Upgrader');
const { platform } = await import('@/platform');
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

const APP_SETTINGS_V2 = 'healthchecks-pocket.appSettings.v2';
const savedV2 = () => JSON.parse(plain.get(APP_SETTINGS_V2)!);
// Version 2 holds the same settings as version 1, in one object.
const defaultAppSettingsV2 = { ...defaultAppSettingsV1 };
const changedAppSettingsV2 = { ...changedAppSettingsV1 };

beforeEach(() => {
  plain.clear();
  vi.restoreAllMocks();
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
  it('finds nothing on a fresh install', async () => {
    expect(await AppSettingsRetriever.retrieveNewestRaw()).toBeNull();
  });

  it('finds version 1 when any of its keys is saved, the rest missing', async () => {
    savedV1({ theme: 'light' });
    const nothingSavedV1 = Object.fromEntries(APP_SETTINGS_V1_KEYS.map((settingKey) => [settingKey, null]));
    expect(await AppSettingsRetriever.retrieveNewestRaw()).toEqual({ version: 1, savedAppSettingsV1: { ...nothingSavedV1, theme: 'light' } });
  });

  it('finds version 1\'s keys as saved, without decoding them', async () => {
    savedV1(changedSavedV1);
    expect(await AppSettingsRetriever.retrieveNewestRaw()).toEqual({ version: 1, savedAppSettingsV1: changedSavedV1 });
  });

  it('finds only version 2 when version 1\'s keys are saved beside it', async () => {
    savedV1(changedSavedV1);
    plain.set(APP_SETTINGS_V2, '{}');
    expect(await AppSettingsRetriever.retrieveNewestRaw()).toEqual({ version: 2, appSettingsV2Json: '{}' });
  });

  it('doesn\'t look for a version newer than the app\'s', async () => {
    plain.set(`healthchecks-pocket.appSettings.v${LATEST_APP_SETTINGS_VERSION + 1}`, '{}');
    expect(await AppSettingsRetriever.retrieveNewestRaw()).toBeNull();
  });
});

describe('AppSettingsDecodeRouter', () => {
  it('decodes version 1 with none of its keys saved as the defaults', () => {
    const nothingSavedV1 = Object.fromEntries(APP_SETTINGS_V1_KEYS.map((settingKey) => [settingKey, null])) as SavedAppSettingsV1;
    expect(AppSettingsDecodeRouter.decode({ version: 1, savedAppSettingsV1: nothingSavedV1 })).toEqual({ version: 1, appSettings: defaultAppSettingsV1 });
  });

  it('decodes each of version 1\'s keys', async () => {
    savedV1(changedSavedV1);
    expect(AppSettingsDecodeRouter.decode((await AppSettingsRetriever.retrieveNewestRaw())!)).toEqual({ version: 1, appSettings: changedAppSettingsV1 });
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
    expect(AppSettingsDecodeRouter.decode((await AppSettingsRetriever.retrieveNewestRaw())!).appSettings).toEqual({ ...defaultAppSettingsV1, ...defaultAppSetting });
  });

  it('decodes version 2', () => {
    expect(AppSettingsDecodeRouter.decode({ version: 2, appSettingsV2Json: JSON.stringify(changedAppSettingsV2) })).toEqual({ version: 2, appSettings: changedAppSettingsV2 });
  });

  it.each(['{not json', 'null', '[]', '"text"', '{}'])('reads a damaged or empty version 2 (%s) as the defaults', (appSettingsV2Json) => {
    expect(AppSettingsDecodeRouter.decode({ version: 2, appSettingsV2Json }).appSettings).toEqual(defaultAppSettingsV2);
  });

  it.each([
    ['onboarded', 'yes'],
    ['timeZoneChoice', ''],
    ['themeMode', 'purple'],
    ['background', 'disco'],
    ['pingBodyTextSize', 99],
    ['pingBodyTextSize', '14'],
    ['pingBodyWrapsLines', 1],
    ['checkForUpdates', null],
    ['skippedUpdateVersion', 5],
    ['lastUpdateCheckMs', -1],
    ['openSections', 'all'],
    ['failNextProjectLoad', '1'],
  ])('reads version 2\'s %s saved as %j, which isn\'t one of its values, as the default, and keeps the rest', (settingName, damagedValue) => {
    const appSettingsV2Json = JSON.stringify({ ...changedAppSettingsV2, [settingName]: damagedValue });
    const settingDefault = defaultAppSettingsV2[settingName as keyof typeof defaultAppSettingsV2];
    expect(AppSettingsDecodeRouter.decode({ version: 2, appSettingsV2Json }).appSettings).toEqual({ ...changedAppSettingsV2, [settingName]: settingDefault });
  });

  it('decodes only version 2\'s own settings', () => {
    const appSettingsV2Json = JSON.stringify({ ...changedAppSettingsV2, lights: 'off', openSections: { ...changedAppSettingsV2.openSections, tags: false } });
    expect(AppSettingsDecodeRouter.decode({ version: 2, appSettingsV2Json }).appSettings).toEqual(changedAppSettingsV2);
  });
});

describe('AppSettingsV1ToV2Upgrader', () => {
  it('goes from version 1 to version 2', () => {
    expect([AppSettingsV1ToV2Upgrader.fromVersion, AppSettingsV1ToV2Upgrader.toVersion]).toEqual([1, 2]);
  });

  it('keeps every setting as it was', () => {
    expect(AppSettingsV1ToV2Upgrader.upgrade(changedAppSettingsV1)).toEqual(changedAppSettingsV2);
    expect(AppSettingsV1ToV2Upgrader.upgrade(defaultAppSettingsV1)).toEqual(defaultAppSettingsV2);
  });
});

describe('AppSettingsPromoter', () => {
  it('promotes version 1 to the latest, through every upgrader on the way', () => {
    expect(AppSettingsPromoter.promoteToLatest({ version: 1, appSettings: changedAppSettingsV1 })).toEqual(changedAppSettingsV2);
  });

  it('leaves the latest version as it is', () => {
    expect(AppSettingsPromoter.promoteToLatest({ version: 2, appSettings: changedAppSettingsV2 })).toEqual(changedAppSettingsV2);
  });
});

describe('AppSettingsStore', () => {
  it('loads the defaults on a fresh install, and saves nothing until a setting changes', async () => {
    expect(await AppSettingsStore.load()).toEqual(defaultAppSettingsV2);
    expect(plain.size).toBe(0);
    await AppSettingsStore.save({ themeMode: 'light' });
    expect([...plain.keys()]).toEqual([APP_SETTINGS_V2]);
    expect(savedV2()).toEqual({ ...defaultAppSettingsV2, themeMode: 'light' });
  });

  it('promotes version 1 once, as it\'s loaded, and leaves version 1\'s keys as they were', async () => {
    savedV1(changedSavedV1);
    expect(await AppSettingsStore.load()).toEqual(changedAppSettingsV2);
    expect(savedV2()).toEqual(changedAppSettingsV2);
    expect(plain.get('healthchecks-pocket.lights')).toBe('heartbeat');

    const save = vi.spyOn(platform, 'save');
    await AppSettingsStore.load();
    expect(save).not.toHaveBeenCalled();
  });

  it('leaves version 2 alone, even when version 1\'s keys are saved beside it', async () => {
    plain.set(APP_SETTINGS_V2, JSON.stringify(changedAppSettingsV2));
    savedV1({ theme: 'auto' });
    expect((await AppSettingsStore.load()).themeMode).toBe('light');
  });

  it('saves a change in version 2, leaving the other settings as saved', async () => {
    plain.set(APP_SETTINGS_V2, JSON.stringify(changedAppSettingsV2));
    await AppSettingsStore.save({ themeMode: 'auto' });
    expect(savedV2()).toEqual({ ...changedAppSettingsV2, themeMode: 'auto' });
  });

  it('saves a change made before version 1 was promoted on top of version 1\'s settings', async () => {
    savedV1(changedSavedV1);
    await AppSettingsStore.save({ themeMode: 'auto' });
    expect(savedV2()).toEqual({ ...changedAppSettingsV2, themeMode: 'auto' });
  });

  it('reads each key once a load, and only version 2\'s once it\'s saved: on a phone each read is a call to Android', async () => {
    const load = vi.spyOn(platform, 'load');
    await AppSettingsStore.load();
    expect(load).toHaveBeenCalledTimes(1 + APP_SETTINGS_V1_KEYS.length);
    await AppSettingsStore.save({ themeMode: 'light' });
    load.mockClear();
    await AppSettingsStore.load();
    expect(load.mock.calls).toEqual([[APP_SETTINGS_V2]]);
  });

  it('keeps both of two changes saved at once', async () => {
    await Promise.all([AppSettingsStore.save({ themeMode: 'light' }), AppSettingsStore.save({ timeZoneChoice: 'UTC' })]);
    expect(savedV2()).toEqual({ ...defaultAppSettingsV2, themeMode: 'light', timeZoneChoice: 'UTC' });
  });
});
