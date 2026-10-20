// Android's Back after a move that goes back (the header's back arrow, saving or removing a project): it goes on to
// the screen before, not to the one just left (goBackTo in src/ui/routes.ts).

import { defaultProject, fakeApi } from '../fixtures/fake-api';
import { expect, pressBack, test } from './device';

test('Back after the back arrow, a save or a removal goes on to the list', async ({ device, page }) => {
  await fakeApi(page, [defaultProject()]);
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.getByRole('button', { name: 'No key yet? Try the demo' }).click();
  await page.getByRole('button', { name: 'Add project' }).click();
  await expect(page.locator('.check-row')).toHaveCount(6);
  const openSettings = () => page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();

  // The back arrow from a ping body, then Back.
  await page.locator('.check-row', { hasText: 'homeserver' }).click();
  await page.locator('.ping-row', { hasText: '#409' }).click();
  await expect(page.locator('pre.body')).toContainText('[ERROR]');
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('homeserver');
  await pressBack(device);
  await expect(page.locator('.check-row')).toHaveCount(6);

  // A second project, to save and then remove.
  await openSettings();
  await page.getByRole('link', { name: 'Add project' }).click();
  await page.getByPlaceholder('Paste API key').fill('key-home');
  await page.getByRole('button', { name: 'Add project' }).click();
  await expect(page.locator('.check-row')).toHaveCount(2);

  // Save a project, then Back.
  await openSettings();
  await page.getByRole('link', { name: 'Edit healthchecks.io' }).click();
  await page.getByPlaceholder('Home lab').fill('Servers');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.project-select-row', { hasText: 'Servers' })).toBeVisible();
  await pressBack(device);
  await expect(page.locator('.check-row')).toHaveCount(2);

  // Remove a project, then Back. Removing asks first, in a dialog Android shows outside the page: say yes from the page.
  await openSettings();
  await page.getByRole('link', { name: 'Edit Servers' }).click();
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button', { name: 'Remove project' }).click();
  await expect(page.locator('.project-select-row')).toHaveCount(1);
  await pressBack(device);
  await expect(page.locator('.check-row')).toHaveCount(6);
});
