// Where the Android app keeps API keys, read from its files on the emulator: encrypted by default, in their own
// file only when the user chose to carry them to a new phone (src/core/storage/storage.ts), and never in logcat.

import { randomUUID } from 'node:crypto';
import { fakeApi, type FakeProject } from '../fixtures/fake-api';
import { check } from '../fixtures/healthchecks';
import { CARRIED_KEYS_FILE, expect, logcatLinesWith, prefsXml, SECURE_STORAGE_FILE, SETTINGS_FILE, sharedPrefs, test } from './device';
import type { Page } from '@playwright/test';

/** A key that can't turn up in any file or log by chance. */
const newApiKey = () => `hcp-ci-${randomUUID()}`;

const projectWithKey = (key: string): FakeProject => ({ key, checks: [structuredClone(check)] });

/** First launch: onboarding with its defaults (keys on this device only), then a project with this key. */
async function addProject(page: Page, apiKey: string) {
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.getByPlaceholder('Home lab').fill('Servers');
  await page.getByPlaceholder('Paste API key').fill(apiKey);
  await page.getByRole('button', { name: 'Add project' }).click();
  await expect(page.locator('.check-row')).toHaveCount(1);
}

test('by default, an API key is saved only encrypted, and never logged', async ({ device, page }) => {
  const apiKey = newApiKey();
  await fakeApi(page, [projectWithKey(apiKey)]);
  await addProject(page, apiKey);

  // Preferences writes its file a moment after the call returns.
  await expect.poll(async () => (await sharedPrefs(device))[SETTINGS_FILE] ?? '').toContain('Servers');
  const files = await sharedPrefs(device);
  expect(files[SECURE_STORAGE_FILE]).toContain('apiKey.');
  for (const [fileName, contents] of Object.entries(files)) expect(contents, fileName).not.toContain(apiKey);
  expect(await logcatLinesWith(device, apiKey), 'logcat').toEqual([]);
});

test('with "Keep API keys on this device only" off, the key is only in its own file, and never logged', async ({ device, page }) => {
  const apiKey = newApiKey();
  await fakeApi(page, [projectWithKey(apiKey)]);
  await addProject(page, apiKey);

  await page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();
  const keepKeysOnDeviceOnlyCheckbox = page.getByRole('checkbox', { name: /Keep API keys on this device only/ });
  // Turning it off asks first, in a dialog Android shows outside the page: say yes from the page.
  await page.evaluate(() => { window.confirm = () => true; });
  await keepKeysOnDeviceOnlyCheckbox.click();
  await expect(keepKeysOnDeviceOnlyCheckbox).not.toBeChecked(); // it moves once the keys have moved

  await expect.poll(async () => (await sharedPrefs(device))[CARRIED_KEYS_FILE] ?? '').toContain(apiKey);
  const files = await sharedPrefs(device);
  for (const [fileName, contents] of Object.entries(files)) {
    if (fileName !== CARRIED_KEYS_FILE) expect(contents, fileName).not.toContain(apiKey);
  }
  expect(await logcatLinesWith(device, apiKey), 'logcat').toEqual([]);
});

test.describe('carried API keys saved by 0.5.3', () => {
  // 0.5.3 kept carried keys in the settings file, which goes to Google backup even when it isn't encrypted. The
  // project that opens first has no key, so the first launch sends no request before the fake API is up.
  const apiKey = newApiKey();
  test.use({
    savedPrefs: {
      [SETTINGS_FILE]: prefsXml({
        'healthchecks-pocket.onboarded': '1',
        'healthchecks-pocket.projects': JSON.stringify([
          { id: 'p0', name: 'Keyless', baseUrl: 'https://healthchecks.io', readOnly: false },
          { id: 'p1', name: 'Servers', baseUrl: 'https://healthchecks.io', readOnly: false },
        ]),
        'healthchecks-pocket.active': 'p0',
        'healthchecks-pocket.keys.deviceOnly': '0',
        'healthchecks-pocket.carriedKeys': JSON.stringify({ p1: apiKey }),
      }),
    },
  });

  test('move out of the settings file into their own on the first launch, and still work', async ({ device, page }) => {
    await expect.poll(async () => (await sharedPrefs(device))[CARRIED_KEYS_FILE] ?? '').toContain(apiKey);
    await expect.poll(async () => (await sharedPrefs(device))[SETTINGS_FILE]).not.toContain(apiKey);

    await fakeApi(page, [projectWithKey(apiKey)]);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Servers/ }).click();
    await expect(page.locator('.check-row')).toHaveCount(1); // the fake API answers only this key
    expect(await logcatLinesWith(device, apiKey), 'logcat').toEqual([]);
  });
});
