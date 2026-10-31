import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettingsV1 } from '@/core/projects/versions/projectSettingsV1';

const plain = new Map<string, string>();
vi.mock('@/platform', () => ({
  platform: {
    load: async (storageKey: string) => plain.get(storageKey) ?? null,
    save: async (storageKey: string, storedValue: string) => void plain.set(storageKey, storedValue),
    remove: async (storageKey: string) => void plain.delete(storageKey),
  },
}));

const { DamagedProjectList } = await import('@/core/projects/versions/damagedProjectList');
const { ProjectSettingsDecodeRouter } = await import('@/core/projects/versions/projectSettingsDecodeRouter');
const { ProjectSettingsPromoter } = await import('@/core/projects/versions/projectSettingsPromoter');
const { ProjectSettingsRetriever } = await import('@/core/projects/versions/projectSettingsRetriever');
const { LATEST_PROJECT_SETTINGS_VERSION, PROJECT_SETTINGS_KEY_BY_VERSION, PROJECT_SETTINGS_VERSIONS } = await import('@/core/projects/versions/projectSettingsVersions');
const { wereProjectsEverSaved } = await import('@/core/projects/savedProjects');

const PROJECTS_V1 = 'healthchecks-pocket.projects';
// As 0.5.7 saved them: one from before #111's ping log days, one on a self-hosted server.
const projectSettingsV1: ProjectSettingsV1 = [
  { id: 'a1', name: 'Home', readOnly: false },
  { id: 'a2', name: 'Work', readOnly: true, pingLogDays: 30, baseUrl: 'https://hc.example.org' },
];

beforeEach(() => {
  plain.clear();
});

describe('project settings versions', () => {
  it('are numbered from 1, oldest first, ending at the latest', () => {
    expect(PROJECT_SETTINGS_VERSIONS[0]).toBe(1);
    expect(PROJECT_SETTINGS_VERSIONS.at(-1)).toBe(LATEST_PROJECT_SETTINGS_VERSION);
    expect(PROJECT_SETTINGS_VERSIONS).toEqual([...PROJECT_SETTINGS_VERSIONS].sort((older, newer) => older - newer));
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

  it('doesn\'t look for projects saved by 0.2/0.3', async () => {
    plain.set('healthchecks-pocket.accounts', JSON.stringify(projectSettingsV1));
    expect(await ProjectSettingsRetriever.retrieveNewestRaw()).toBeNull();
  });
});

describe('ProjectSettingsDecodeRouter', () => {
  it('decodes version 1 as saved, its fields not yet checked', () => {
    const rawProjectSettings = { version: 1, projectSettingsJson: JSON.stringify(projectSettingsV1) } as const;
    expect(ProjectSettingsDecodeRouter.decode(rawProjectSettings)).toEqual({ version: 1, projectSettings: projectSettingsV1 });
  });

  it('drops version 1 entries without an id, so one can\'t stop the rest from loading', () => {
    const projectSettingsJson = JSON.stringify([null, 42, 'text', { name: 'no id' }, projectSettingsV1[0]]);
    expect(ProjectSettingsDecodeRouter.decode({ version: 1, projectSettingsJson }).projectSettings).toEqual([projectSettingsV1[0]]);
  });

  it.each(['{not json', '{"id":"a1"}', 'null', '"text"'])('says a damaged version 1 list (%s) is damaged', (projectSettingsJson) => {
    expect(() => ProjectSettingsDecodeRouter.decode({ version: 1, projectSettingsJson })).toThrow(DamagedProjectList);
  });
});

describe('ProjectSettingsPromoter', () => {
  it('leaves the latest version as it is', () => {
    expect(ProjectSettingsPromoter.promoteToLatest({ version: 1, projectSettings: projectSettingsV1 })).toEqual(projectSettingsV1);
  });
});

describe('wereProjectsEverSaved', () => {
  it('is false on a fresh install', async () => {
    expect(await wereProjectsEverSaved()).toBe(false);
  });

  it('is true once a list was saved, even an empty one: every project was removed', async () => {
    plain.set(PROJECTS_V1, '[]');
    expect(await wereProjectsEverSaved()).toBe(true);
  });
});
