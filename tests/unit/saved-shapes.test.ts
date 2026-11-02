// Exactly what the app saves today, through the code that saves it. When one of these fails, what's saved changed: add
// a version for it, with an upgrader from the version before (docs/ARCHITECTURE.md, "Changing what's saved"), then
// update the shape here.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/core/projects/project';

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

const { AppSettingsStore } = await import('@/core/app-settings/appSettingsStore');
const { LATEST_APP_SETTINGS_VERSION } = await import('@/core/app-settings/versions/appSettingsVersions');
const { saveProjects } = await import('@/core/projects/savedProjects');
const { LATEST_PROJECT_SETTINGS_VERSION, PROJECT_SETTINGS_KEY_BY_VERSION } = await import('@/core/projects/versions/projectSettingsVersions');

/** Each field's name and type, as `typeof` names it ('object' for null). */
const shapeOf = (savedObject: Record<string, unknown>) => Object.fromEntries(Object.entries(savedObject).map(([fieldName, fieldValue]) => [fieldName, typeof fieldValue]));

beforeEach(() => {
  plain.clear();
  secret.clear();
});

describe('what the app saves', () => {
  it('saves the projects as project settings version 2, each with exactly these fields', async () => {
    const savedProject: Project = { id: 'p1', name: 'Home', apiKey: 'key-home', readOnly: false, pingLogDays: 7 };
    await saveProjects([savedProject], 'p1', true);
    expect(LATEST_PROJECT_SETTINGS_VERSION).toBe(2);
    const savedProjectList: Record<string, unknown>[] = JSON.parse(plain.get(`healthchecks-pocket.${PROJECT_SETTINGS_KEY_BY_VERSION[2]}`)!);
    expect(savedProjectList.map(shapeOf)).toEqual([{ id: 'string', name: 'string', readOnly: 'boolean', pingLogDays: 'number' }]);
  });

  it('saves the app settings as app settings version 2: one object with exactly these fields', async () => {
    await AppSettingsStore.save({ skippedUpdateVersion: '0.5.6', lastUpdateCheckMs: 1761800000000 });
    expect(LATEST_APP_SETTINGS_VERSION).toBe(2);
    const savedAppSettings = JSON.parse(plain.get('healthchecks-pocket.appSettings.v2')!);
    expect(shapeOf(savedAppSettings)).toEqual({
      onboarded: 'boolean',
      timeZoneChoice: 'string',
      themeMode: 'string',
      background: 'string',
      pingBodyTextSize: 'number',
      pingBodyWrapsLines: 'boolean',
      checkForUpdates: 'boolean',
      skippedUpdateVersion: 'string',
      lastUpdateCheckMs: 'number',
      openSections: 'object',
      failNextProjectLoad: 'boolean',
    });
    expect(shapeOf(savedAppSettings.openSections)).toEqual({ flips: 'boolean', pings: 'boolean' });
  });
});
