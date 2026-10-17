// The app's core pages on Android, with the demo project and a faked healthchecks.io: what a new user does first.

import { defaultProject, fakeApi } from '../fixtures/fake-api';
import { expect, logcatLinesWith, pressBack, test } from './device';

test('demo: a check, a ping body, Back to the list, then switch, add and edit projects in Settings', async ({ device, page }) => {
  await fakeApi(page, [defaultProject()]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Healthchecks Pocket');
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.getByRole('button', { name: 'No key yet? Try the demo' }).click();
  await page.getByRole('button', { name: 'Add project' }).click();
  await expect(page.locator('.check-row')).toHaveCount(6);
  await expect(page.locator('.project-name')).toHaveText('Demo project');

  await page.locator('.check-row', { hasText: 'homeserver' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('homeserver');
  await page.locator('.ping-row', { hasText: '#409' }).click();
  await expect(page.locator('pre.body')).toContainText('[ERROR]');

  // Android's Back button goes back a screen at a time (src/platform/native.ts).
  await pressBack(device);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('homeserver');
  await pressBack(device);
  await expect(page.locator('.check-row')).toHaveCount(6);

  await page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();
  await page.getByRole('link', { name: 'Add project' }).click();
  await page.getByPlaceholder('Paste API key').fill('key-home');
  await page.getByRole('button', { name: 'Add project' }).click();
  await expect(page.locator('.check-row')).toHaveCount(2);
  await expect(page.locator('.project-picker option')).toHaveText(['Demo project', 'healthchecks.io']);

  await page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();
  await page.locator('.project-select-row', { hasText: 'Demo project' }).click();
  await expect(page.locator('.check-row')).toHaveCount(6);
  await expect(page.locator('.project-picker option:checked')).toHaveText('Demo project');

  await page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();
  await page.getByRole('link', { name: 'Edit healthchecks.io' }).click();
  await page.getByPlaceholder('Home lab').fill('Servers');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.project-select-row', { hasText: 'Servers' })).toBeVisible();

  expect(await logcatLinesWith(device, 'key-home'), 'logcat').toEqual([]);
});
