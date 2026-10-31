import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettingsV1 } from '@/core/projects/versions/projectSettingsV1';
import type { ProjectSettingsV2 } from '@/core/projects/versions/projectSettingsV2';

const plain = new Map<string, string>();
const secret = new Map<string, string>();
vi.mock('@/platform', () => ({
  platform: {
    load: async (storageKey: string) => plain.get(storageKey) ?? null,
    save: async (storageKey: string, storedValue: string) => void plain.set(storageKey, storedValue),
    remove: async (storageKey: string) => void plain.delete(storageKey),
    loadSecret: async (storageKey: string) => secret.get(storageKey) ?? null,
    saveSecret: async (storageKey: string, storedValue: string) => void secret.set(storageKey, storedValue),
    removeSecret: async (storageKey: string) => void secret.delete(storageKey),
  },
}));

const { DamagedProjectList } = await import('@/core/projects/versions/damagedProjectList');
const { ProjectSettingsDecodeRouter } = await import('@/core/projects/versions/projectSettingsDecodeRouter');
const { ProjectSettingsPromoter } = await import('@/core/projects/versions/projectSettingsPromoter');
const { ProjectSettingsRetriever } = await import('@/core/projects/versions/projectSettingsRetriever');
const { ProjectSettingsV1ToV2Upgrader } = await import('@/core/projects/versions/projectSettingsV1ToV2Upgrader');
const { LATEST_PROJECT_SETTINGS_VERSION, PROJECT_SETTINGS_KEY_BY_VERSION, PROJECT_SETTINGS_VERSIONS } = await import('@/core/projects/versions/projectSettingsVersions');
const { promoteSavedProjectsToLatestVersion, wereProjectsEverSaved } = await import('@/core/projects/savedProjects');
const { platform } = await import('@/platform');

const PROJECTS_V1 = 'healthchecks-pocket.projects';
const PROJECTS_V2 = 'healthchecks-pocket.projects.v2';
const apiKeyStorageKey = (projectId: string) => `healthchecks-pocket.apiKey.${projectId}`;
// As 0.5.7 saved them: one from before #111's ping log days, one with damaged days, one on a self-hosted server.
const projectSettingsV1: ProjectSettingsV1 = [
  { id: 'a1', name: 'Home', readOnly: false },
  { id: 'a2', name: 'Work', readOnly: true, pingLogDays: 45, baseUrl: 'https://healthchecks.io' },
  { id: 'a3', name: 'Lab', readOnly: false, pingLogDays: 30, baseUrl: 'https://hc.example.org' },
];
// What version 2 makes of them.
const projectSettingsV2: ProjectSettingsV2 = [
  { id: 'a1', name: 'Home', readOnly: false, pingLogDays: 7 },
  { id: 'a2', name: 'Work', readOnly: true, pingLogDays: 7 },
];

beforeEach(() => {
  plain.clear();
  secret.clear();
  vi.restoreAllMocks();
});

describe('project settings versions', () => {
  it('are numbered from 1, one after another, ending at the latest', () => {
    expect(PROJECT_SETTINGS_VERSIONS).toEqual(PROJECT_SETTINGS_VERSIONS.map((_, versionIndex) => versionIndex + 1));
    expect(PROJECT_SETTINGS_VERSIONS.at(-1)).toBe(LATEST_PROJECT_SETTINGS_VERSION);
  });

  it('are each saved under a key of their own', () => {
    const storageKeys = PROJECT_SETTINGS_VERSIONS.map((version) => PROJECT_SETTINGS_KEY_BY_VERSION[version]);
    expect(new Set(storageKeys).size).toBe(PROJECT_SETTINGS_VERSIONS.length);
  });

  it('start at version 1: the `projects` setting saved before versions existed', () => {
    expect(PROJECT_SETTINGS_KEY_BY_VERSION[1]).toBe('projects');
  });
});

describe('ProjectSettingsRetriever', () => {
  it('finds nothing on a fresh install', async () => {
    expect(await ProjectSettingsRetriever.retrieveNewestRaw()).toBeNull();
  });

  it('finds version 1 as saved, without decoding it', async () => {
    plain.set(PROJECTS_V1, '{not json');
    expect(await ProjectSettingsRetriever.retrieveNewestRaw()).toEqual({ version: 1, projectSettingsJson: '{not json' });
  });

  it('finds only the newest version when older ones are saved beside it', async () => {
    plain.set(PROJECTS_V1, JSON.stringify(projectSettingsV1));
    plain.set(PROJECTS_V2, '[]');
    expect(await ProjectSettingsRetriever.retrieveNewestRaw()).toEqual({ version: 2, projectSettingsJson: '[]' });
  });

  it('doesn\'t look for a version newer than the app\'s, or for projects saved by 0.2/0.3', async () => {
    plain.set(`healthchecks-pocket.projects.v${LATEST_PROJECT_SETTINGS_VERSION + 1}`, '[]');
    plain.set('healthchecks-pocket.accounts', JSON.stringify(projectSettingsV1));
    expect(await ProjectSettingsRetriever.retrieveNewestRaw()).toBeNull();
  });
});

describe('ProjectSettingsDecodeRouter', () => {
  it('decodes version 1 as saved, its fields not yet checked', () => {
    const rawProjectSettings = { version: 1, projectSettingsJson: JSON.stringify(projectSettingsV1) } as const;
    expect(ProjectSettingsDecodeRouter.decode(rawProjectSettings)).toEqual({ version: 1, projectSettings: projectSettingsV1 });
  });

  it('decodes version 2', () => {
    const rawProjectSettings = { version: 2, projectSettingsJson: JSON.stringify(projectSettingsV2) } as const;
    expect(ProjectSettingsDecodeRouter.decode(rawProjectSettings)).toEqual({ version: 2, projectSettings: projectSettingsV2 });
  });

  it.each([45, 0, 7.5, '14', null, undefined])('reads version 2\'s ping log days that aren\'t one of the choices (%j) as damaged: the default', (damagedPingLogDays) => {
    const projectSettingsJson = JSON.stringify([{ ...projectSettingsV2[1], pingLogDays: damagedPingLogDays }]);
    expect(ProjectSettingsDecodeRouter.decode({ version: 2, projectSettingsJson }).projectSettings).toEqual([{ ...projectSettingsV2[1], pingLogDays: 7 }]);
  });

  it('decodes only version 2\'s own fields', () => {
    const projectSettingsJson = JSON.stringify([{ ...projectSettingsV2[0], baseUrl: 'https://healthchecks.io' }]);
    expect(ProjectSettingsDecodeRouter.decode({ version: 2, projectSettingsJson }).projectSettings).toEqual([projectSettingsV2[0]]);
  });

  it.each([1, 2] as const)('drops version %i entries without an id, so one can\'t stop the rest from loading', (version) => {
    const projectSettingsJson = JSON.stringify([null, 42, 'text', { name: 'no id' }, projectSettingsV2[0]]);
    expect(ProjectSettingsDecodeRouter.decode({ version, projectSettingsJson }).projectSettings).toEqual([projectSettingsV2[0]]);
  });

  it.each([1, 2] as const)('says a damaged version %i list is damaged', (version) => {
    for (const projectSettingsJson of ['{not json', '{"id":"a1"}', 'null', '"text"']) {
      expect(() => ProjectSettingsDecodeRouter.decode({ version, projectSettingsJson })).toThrow(DamagedProjectList);
    }
  });
});

describe('ProjectSettingsV1ToV2Upgrader', () => {
  it('goes from version 1 to version 2', () => {
    expect([ProjectSettingsV1ToV2Upgrader.fromVersion, ProjectSettingsV1ToV2Upgrader.toVersion]).toEqual([1, 2]);
  });

  it('keeps the names and key kinds, drops the server and the projects on other servers, and gives every project ping log days', () => {
    expect(ProjectSettingsV1ToV2Upgrader.upgrade(projectSettingsV1)).toEqual(projectSettingsV2);
  });

  it('keeps ping log days that are one of the choices', () => {
    expect(ProjectSettingsV1ToV2Upgrader.upgrade([{ id: 'a1', name: 'Home', readOnly: false, pingLogDays: 30 }])).toEqual([{ id: 'a1', name: 'Home', readOnly: false, pingLogDays: 30 }]);
  });

  it.each(['https://healthchecks.io/', 'https://hc.example.org', 'http://healthchecks.io', 'not a url', null])('keeps a project saved with the server %j only when it\'s healthchecks.io', (baseUrl) => {
    const upgradedProjectIds = ProjectSettingsV1ToV2Upgrader.upgrade([{ id: 'a1', name: 'Home', readOnly: false, baseUrl }]).map(({ id }) => id);
    expect(upgradedProjectIds).toEqual(baseUrl === 'https://healthchecks.io/' ? ['a1'] : []);
  });
});

describe('ProjectSettingsPromoter', () => {
  it('promotes version 1 to the latest, through every upgrader on the way', () => {
    expect(ProjectSettingsPromoter.promoteToLatest({ version: 1, projectSettings: projectSettingsV1 })).toEqual(projectSettingsV2);
  });

  it('leaves the latest version as it is', () => {
    expect(ProjectSettingsPromoter.promoteToLatest({ version: 2, projectSettings: projectSettingsV2 })).toEqual(projectSettingsV2);
  });
});

describe('promoteSavedProjectsToLatestVersion', () => {
  it('saves nothing on a fresh install', async () => {
    await promoteSavedProjectsToLatestVersion();
    expect(plain.size).toBe(0);
  });

  it('saves version 1 again as the latest version, beside it, and leaves version 1 as it was', async () => {
    plain.set(PROJECTS_V1, JSON.stringify(projectSettingsV1));
    await promoteSavedProjectsToLatestVersion();
    expect(JSON.parse(plain.get(PROJECTS_V2)!)).toEqual(projectSettingsV2);
    expect(JSON.parse(plain.get(PROJECTS_V1)!)).toEqual(projectSettingsV1);
  });

  it('deletes the API keys of projects the upgrade dropped, and keeps the rest', async () => {
    plain.set(PROJECTS_V1, JSON.stringify(projectSettingsV1));
    ['a1', 'a2', 'a3'].forEach((projectId) => secret.set(apiKeyStorageKey(projectId), `key-${projectId}`));
    await promoteSavedProjectsToLatestVersion();
    expect([...secret.keys()]).toEqual([apiKeyStorageKey('a1'), apiKeyStorageKey('a2')]);
  });

  it('leaves the latest version alone, even when an older one is saved beside it', async () => {
    plain.set(PROJECTS_V1, JSON.stringify(projectSettingsV1));
    plain.set(PROJECTS_V2, '[]');
    const save = vi.spyOn(platform, 'save');
    await promoteSavedProjectsToLatestVersion();
    expect(save).not.toHaveBeenCalled();
    expect(plain.get(PROJECTS_V2)).toBe('[]');
  });

  it('saves the latest version last: one that stops partway is promoted again on the next launch', async () => {
    plain.set(PROJECTS_V1, JSON.stringify(projectSettingsV1));
    vi.spyOn(platform, 'removeSecret').mockRejectedValueOnce(new Error('Keystore unavailable'));
    await expect(promoteSavedProjectsToLatestVersion()).rejects.toThrow('Keystore unavailable');
    expect(plain.has(PROJECTS_V2)).toBe(false);

    await promoteSavedProjectsToLatestVersion();
    expect(JSON.parse(plain.get(PROJECTS_V2)!)).toEqual(projectSettingsV2);
  });
});

describe('wereProjectsEverSaved', () => {
  it('is false on a fresh install', async () => {
    expect(await wereProjectsEverSaved()).toBe(false);
  });

  it.each([PROJECTS_V1, PROJECTS_V2])('is true once a list was saved (%s), even an empty one: every project was removed', async (projectsKey) => {
    plain.set(projectsKey, '[]');
    expect(await wereProjectsEverSaved()).toBe(true);
  });
});
