import { defaultProject, expect, fakeApi, freezeClock, homeProject, NOW, openApp, test, UUID } from './fixtures';

test.describe('first launch', () => {
  test('demo: onboarding, add the demo project, open a check, read a ping body', async ({ page }) => {
    await openApp(page, { projects: [], storage: { 'healthchecks-pocket.onboarded': '' } });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Healthchecks Pocket');
    // Choices apply at once: the page restyles as you tap.
    await page.getByRole('combobox', { name: /^Theme/ }).selectOption('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)');
    await page.getByRole('combobox', { name: /^Theme/ }).selectOption('light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 247)');
    await page.getByRole('button', { name: "Let's go" }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Healthchecks Pocket');
    // The storage notice shows only its first line until it's tapped.
    await expect(page.locator('.notice summary')).toHaveText('Not encrypted in the browser.');
    await expect(page.locator('.notice p')).toBeHidden();
    await page.locator('.notice summary').click();
    await expect(page.locator('.notice p')).toBeVisible();
    await expect(page.locator('.notice p')).toHaveText("The web version keeps your API key in this browser's local storage. For encrypted storage, use the Android app.");
    await page.getByRole('button', { name: 'No key yet? Try the demo' }).click();
    await page.getByRole('button', { name: 'Add project' }).click();

    await expect(page.locator('.check-row')).toHaveCount(6);
    await expect(page.locator('.project-name')).toHaveText('Demo project');
    await page.locator('.check-row', { hasText: 'homeserver' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('homeserver');
    await page.locator('.ping-row', { hasText: 'Failure' }).click();
    await expect(page.locator('pre.body .line-error').first()).toContainText('[ERROR] nightly-backup: upload failed');
    await expect(page.locator('pre.body .line-debug').first()).toContainText('[DEBUG] retrying upload');
    // Links in a body open in a new tab (the system browser on a phone).
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByRole('link', { name: 'https://example.com/backups/nightly.log' }).click(),
    ]);
    expect(tab.url()).toBe('https://example.com/backups/nightly.log');
    await tab.close();

    // A verbose run's body is too long to show whole: its start, as plain text, says so above and at the end.
    await page.goBack();
    await page.locator('.ping-row', { hasText: '#407' }).click();
    await expect(page.getByRole('note')).toContainText('Body too long: showing the first 10,000 of');
    await expect(page.locator('pre.body')).toContainText('[DEBUG] uploaded chunk 1/240');
    await expect(page.locator('pre.body .line-warn')).toHaveText("Body is trimmed as it's too long.");
    await expect(page.locator('pre.body a')).toHaveCount(0);

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('homeserver');
    await page.goBack();
    await expect(page.locator('.check-row')).toHaveCount(6);
  });

  test('a real key is checked against the API, then the project opens', async ({ page }) => {
    const requests = await fakeApi(page, [defaultProject()]);
    await openApp(page, { projects: [] });
    await page.getByPlaceholder('Home lab').fill('Servers');
    await page.getByPlaceholder('Paste API key').fill('key-home');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.locator('.check-row')).toHaveCount(2);
    await expect(page.locator('.project-name')).toHaveText('Servers');
    expect(requests[0]).toBe('GET /checks/');
  });
});

test.describe('check detail', () => {
  test('status, status changes, ping log, then pause; pause and resume round trip', async ({ page }) => {
    await freezeClock(page);
    await fakeApi(page, [defaultProject()]);
    page.on('dialog', (dialog) => dialog.accept());
    await openApp(page, { hash: `#/check/${UUID}` });

    const main = page.locator('main');
    await expect(main.locator('.badge')).toHaveText('Up');
    await expect(main.locator('.facts')).toContainText('Last ping5m 00s agoOct 12, 04:55:00 AM');
    const order = await main.evaluate((element) => {
      const pageText = element.textContent ?? '';
      return ['Last ping', 'Status changes (30 days)', 'Ping log', 'Pause monitoring', 'On healthchecks.io'].map((label) => pageText.indexOf(label));
    });
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((first, second) => first - second)).toEqual(order);
    await expect(main.locator('.flip-row')).toHaveCount(3);
    await expect(main.locator('.flip').first()).toHaveText('Went up');
    await expect(main.locator('.ping-row')).toHaveCount(3);

    await page.getByRole('button', { name: 'Pause monitoring' }).click();
    await expect(main.locator('.badge')).toHaveText('Paused');
    await page.getByRole('button', { name: 'Resume monitoring' }).click();
    await expect(main.locator('.badge')).toHaveText('New');
    await expect(main.locator('.facts')).toContainText('Last pingnever'); // healthchecks.io cleared it, though the ping log has pings
  });

  test('folded sections stay folded after a reload', async ({ page }) => {
    await fakeApi(page, [defaultProject()]);
    await freezeClock(page); // the pings are dated from the fixtures' NOW, so they're inside the ping log's last 7 days
    await openApp(page, { hash: `#/check/${UUID}` });
    await expect(page.locator('.ping-row')).toHaveCount(3);
    await page.locator('.section-toggle', { hasText: 'Ping log' }).click();
    await expect(page.locator('.ping-row')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.flip-row')).toHaveCount(3);
    await expect(page.locator('.ping-row')).toHaveCount(0);
    await expect(page.locator('.section-toggle', { hasText: 'Ping log' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('a long ping log pages 40 at a time', async ({ page }) => {
    // A free plan's whole log: 100 pings half an hour apart, about 2 days, all inside the project's default 7 days.
    const [templatePing] = defaultProject().pings![UUID];
    const halfHourlyPings = Array.from({ length: 100 }, (_, newestFirstIndex) => ({
      ...templatePing,
      n: 100 - newestFirstIndex,
      date: new Date(NOW - (5 + 30 * newestFirstIndex) * 60_000).toISOString(),
    }));
    await fakeApi(page, [{ ...defaultProject(), pings: { [UUID]: halfHourlyPings } }]);
    await freezeClock(page); // the pings are dated from the fixtures' NOW
    await openApp(page, { hash: `#/check/${UUID}` });
    await expect(page.getByText('Pings since 7 days ago')).toBeVisible();
    await expect(page.locator('.ping-row')).toHaveCount(40);
    await expect(page.getByText('Page 1 of 3')).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 3 of 3')).toBeVisible();
    await expect(page.locator('.ping-row')).toHaveCount(20);
    await expect(page.locator('.ping-row').first()).toContainText('#20');
  });

  test('tag edits are saved to the server', async ({ page }) => {
    const requests = await fakeApi(page, [defaultProject()]);
    await openApp(page, { hash: `#/check/${UUID}` });
    await page.getByRole('button', { name: 'Edit tags' }).click();
    await page.getByRole('button', { name: 'Remove tag home' }).click();
    await page.getByRole('textbox', { name: 'New tag' }).pressSequentially('backups ');
    await page.getByRole('button', { name: 'Save tags' }).click();
    await expect(page.locator('.tag-chip-static')).toHaveText(['nas', 'backups']);
    expect(requests).toContain(`POST /checks/${UUID}`);
  });
});

test.describe('time zone', () => {
  test('changing it in Settings updates every exact timestamp and survives a reload', async ({ page }) => {
    await freezeClock(page);
    await fakeApi(page, [defaultProject()]);
    await openApp(page);
    await expect(page.locator('.updated')).toHaveText('Updated Oct 12, 05:00:00 AM GMT+9');
    await page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();
    await page.getByRole('combobox', { name: /Times in the app are shown in/ }).selectOption('UTC');
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page.locator('.updated')).toHaveText('Updated Oct 11, 08:00:00 PM UTC');

    await page.locator('.check-row', { hasText: 'backup-server' }).click();
    await expect(page.locator('.facts')).toContainText('Oct 11, 07:55:00 PM');
    await expect(page.locator('.ping-row').first()).toContainText('Oct 11, 07:55:00 PM · #29');
    await expect(page.locator('.flip-row').first()).toContainText('Oct 11, 06:00:00 PM');

    await page.reload();
    await expect(page.locator('.facts')).toContainText('Oct 11, 07:55:00 PM');
  });
});

test.describe('settings', () => {
  test('edit and add projects in Settings, and switch between them on the list', async ({ page }) => {
    const work = { ...homeProject, id: 'p2', name: 'Work', apiKey: 'key-work' };
    await fakeApi(page, [defaultProject(), { key: 'key-work', checks: [] }, { key: 'key-new', checks: [] }]);
    await openApp(page, { projects: [homeProject, work], hash: '#/settings' });
    await page.locator('.project-summary', { hasText: 'Work' }).click(); // only Edit opens anything
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');

    await page.getByRole('link', { name: 'Edit Work' }).click();
    await page.getByPlaceholder('Home lab').fill('Office');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.project-summary', { hasText: 'Office' })).toBeVisible();

    await page.getByRole('link', { name: 'Add project' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add project');
    await page.getByPlaceholder('Paste API key').fill('key-new');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.locator('.project-picker option')).toHaveText(['Home lab', 'Office', 'healthchecks.io']);
    await page.locator('.project-picker').selectOption('p1');
    await expect(page.locator('.check-row')).toHaveCount(2);
  });
});

// Android's Back calls history.back() (src/platform/native.ts), as page.goBack() does.
test.describe('Back, after a move that goes back', () => {
  test('after the back arrow, goes on to the list, not to the ping just left', async ({ page }) => {
    await fakeApi(page, [defaultProject()]);
    await freezeClock(page); // the pings are dated from the fixtures' NOW, so they're inside the ping log's last 7 days
    await openApp(page);
    await page.locator('.check-row', { hasText: 'backup-server' }).click();
    await page.locator('.ping-row', { hasText: '#27' }).click();
    await expect(page.locator('pre.body')).toBeVisible();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('backup-server');
    await page.goBack();
    await expect(page.locator('.check-row')).toHaveCount(2);
  });

  test('after saving a project, goes on to the list, not to the form', async ({ page }) => {
    await fakeApi(page, [defaultProject()]);
    await openApp(page);
    await page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();
    await page.getByRole('link', { name: 'Edit Home lab' }).click();
    await page.getByPlaceholder('Home lab').fill('Office');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.project-summary', { hasText: 'Office' })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.check-row')).toHaveCount(2);
  });

  test('after removing a project, goes on to the list, not to the removed project', async ({ page }) => {
    const work = { ...homeProject, id: 'p2', name: 'Work', apiKey: 'key-work' };
    await fakeApi(page, [defaultProject(), { key: 'key-work', checks: [] }]);
    page.on('dialog', (dialog) => dialog.accept());
    await openApp(page, { projects: [homeProject, work] });
    await page.getByRole('button', { name: 'Settings' }).or(page.getByRole('link', { name: 'Settings' })).click();
    await page.getByRole('link', { name: 'Edit Work' }).click();
    await page.getByRole('button', { name: 'Remove project' }).click();
    await expect(page.locator('.project-summary')).toHaveCount(1);
    await page.goBack();
    await expect(page.locator('.check-row')).toHaveCount(2);
  });
});

test('rename a check from its page', async ({ page }) => {
  const requests = await fakeApi(page, [defaultProject()]);
  await openApp(page, { hash: `#/check/${UUID}` });
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Check name' }).fill('Nightly backup');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nightly backup');
  expect(requests.filter((request) => request.startsWith('POST'))).toEqual([`POST /checks/${UUID}`]);
});
