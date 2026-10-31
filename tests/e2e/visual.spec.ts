// Things only a real browser rendering the production CSS can check: the
// minifier once reordered `font` after `font-variant-numeric`, silently
// resetting tabular digits, so these run against `vite build` output.

import { defaultProject, expect, fakeApi, freezeClock, homeProject, openApp, test, UUID } from './fixtures';

test('ticking times keep a constant width (tabular digits survive the build)', async ({ page }) => {
  await freezeClock(page);
  await fakeApi(page, [defaultProject()]);
  await openApp(page);
  const meta = page.locator('.check-row', { hasText: 'backup-server' }).locator('.check-meta');
  await expect(meta).toHaveText('last ping 5m 00s ago · next in 55m 00s');
  await expect(meta).toHaveCSS('font-variant-numeric', 'tabular-nums');

  const width = () => meta.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Math.round(range.getBoundingClientRect().width * 100) / 100;
  });
  const widths = new Set<number>();
  const texts = new Set<string>();
  for (let i = 0; i < 12; i++) {
    widths.add(await width());
    texts.add((await meta.textContent()) ?? '');
    await page.clock.runFor(1000);
  }
  expect(texts.size).toBeGreaterThan(10); // it really ticked
  expect([...widths]).toHaveLength(1);
});

test('the refresh icon spins around its own centre, with a progress bar', async ({ page }) => {
  await fakeApi(page, [defaultProject()], { delayMs: 1200 });
  await openApp(page);
  await expect(page.locator('.check-row')).toHaveCount(2, { timeout: 5000 });
  const button = page.getByRole('button', { name: 'Refresh' });
  await button.click();
  await expect(page.getByRole('progressbar', { name: 'Refreshing' })).toBeVisible();
  const icon = button.locator('svg');
  await expect(icon).toHaveClass(/spinning/);
  const centres = new Set<string>();
  const angles = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const sample = await icon.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { centre: `${(rect.x + rect.width / 2).toFixed(1)},${(rect.y + rect.height / 2).toFixed(1)}`, transform: getComputedStyle(element).transform };
    });
    centres.add(sample.centre);
    angles.add(sample.transform);
    await page.waitForTimeout(60);
  }
  expect(angles.size).toBeGreaterThan(1); // it's rotating
  expect([...centres]).toHaveLength(1); // around a fixed centre
  await expect(page.getByRole('progressbar')).toBeHidden({ timeout: 5000 });
});

test('bar labels stay on one line, even on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await fakeApi(page, [defaultProject()]);
  await openApp(page);
  const labels = page.locator('.project-bar-label');
  await expect(labels).toHaveText(['Project']);
  for (const height of await labels.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))) {
    expect(height).toBeLessThan(24);
  }
});

test('a check row\'s many tags wrap onto more lines, and a long one breaks inside its chip, on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const project = defaultProject();
  project.checks[0].tags = 'home nas backups nightly offsite encrypted weekly raid averylongtagnamewithnowheretobreakitatall';
  await fakeApi(page, [project]);
  await openApp(page);
  const rowTags = page.locator('.check-row', { hasText: 'backup-server' }).locator('.check-tags');
  const chips = rowTags.locator('.tag-chip');
  await expect(chips).toHaveCount(9);
  const chipBoxes = await chips.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON() as DOMRect));
  expect(new Set(chipBoxes.map((chipBox) => chipBox.top)).size).toBeGreaterThan(1); // more than one line
  const rowTagsRight = await rowTags.evaluate((element) => element.getBoundingClientRect().right);
  expect(Math.max(...chipBoxes.map((chipBox) => chipBox.right))).toBeLessThanOrEqual(rowTagsRight); // not under the chevron
});

test('project rows in Settings stay on one line each, even with long names, on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await fakeApi(page, [defaultProject()]);
  const long = { ...homeProject, id: 'p2', name: 'A rather long project name for the backups' };
  await openApp(page, { hash: '#/settings', projects: [homeProject, long] });
  const lines = page.locator('.project-summary .check-name, .project-summary .check-meta');
  await expect(lines).toHaveCount(4);
  for (const height of await lines.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))) {
    expect(height).toBeLessThan(26); // a single line
  }
  await expect(page.getByRole('link', { name: /^Edit A rather long/ })).toBeVisible();
});

test('no screen scrolls sideways on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await fakeApi(page, [defaultProject()]);
  for (const hash of ['#/', `#/check/${UUID}`, `#/check/${UUID}/ping/27`, '#/settings', '#/settings/add', '#/settings/project/p1']) {
    await openApp(page, { hash });
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
});

test('onboarding fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page, { projects: [], storage: { 'healthchecks-pocket.onboarded': '' } });
  await expect(page.getByRole('button', { name: "Let's go" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('northern lights drift behind onboarding, and hold still for reduced motion', async ({ page }) => {
  await openApp(page, { projects: [], storage: { 'healthchecks-pocket.onboarded': '' } });
  const light = page.locator('.aurora span').first();
  await expect(light).toBeAttached();
  const transform = () => light.evaluate((element) => getComputedStyle(element).transform);
  const before = await transform();
  await page.waitForTimeout(400);
  expect(await transform()).not.toBe(before); // it's moving
  // Behind the content: the welcome text and buttons stay usable.
  await expect(page.locator('.aurora')).toHaveCSS('pointer-events', 'none');
  // Carries on into adding the first project: the same lights, not restarted.
  await page.locator('.aurora').evaluate((element) => { element.dataset.mark = 'same'; });
  await page.getByRole('button', { name: "Let's go" }).click();
  await expect(page.getByPlaceholder('Paste API key')).toBeVisible();
  await expect(page.locator('.aurora')).toHaveAttribute('data-mark', 'same');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(light).toHaveCSS('animation-name', 'none');
});

test('northern lights "while loading" show while the list refreshes, then fade away', async ({ page }) => {
  await fakeApi(page, [defaultProject()], { delayMs: 1500 });
  await openApp(page, { storage: { 'healthchecks-pocket.lights': 'loading' } });
  const lights = page.locator('.aurora-loading');
  await expect(lights).toBeAttached(); // first load
  await expect(page.locator('.check-row')).toHaveCount(2, { timeout: 5000 });
  await expect(lights).toBeHidden({ timeout: 5000 });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(lights).toBeAttached();
  // Fades out (opacity passes between 1 and 0) rather than vanishing. Sampled in the page every frame until the lights
  // go: sampling from the test missed the 0.6s fade on a busy machine.
  const opacitiesWhileLeaving = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const seenOpacities: number[] = [];
    const giveUpAt = performance.now() + 8000;
    const sampleOpacity = () => {
      const loadingLights = document.querySelector('.aurora-loading');
      if (loadingLights?.classList.contains('aurora-leaving')) {
        seenOpacities.push(Number(getComputedStyle(loadingLights).opacity));
      }
      if (loadingLights && performance.now() < giveUpAt) {
        requestAnimationFrame(sampleOpacity);
      } else {
        resolve(seenOpacities);
      }
    };
    sampleOpacity();
  }));
  expect(opacitiesWhileLeaving.some((opacity) => opacity > 0 && opacity < 1), opacitiesWhileLeaving.join()).toBe(true);
  await expect(lights).toBeHidden();
});

test('Background "breathing" fades the lights on and off; "None" shows none, even during setup', async ({ page }) => {
  await openApp(page, { projects: [], storage: { 'healthchecks-pocket.onboarded': '', 'healthchecks-pocket.lights': 'breathing' } });
  const aurora = page.locator('.aurora');
  await expect(aurora).toHaveClass(/aurora-breathing/);
  const opacities = new Set<string>();
  for (let i = 0; i < 8; i++) {
    opacities.add(await aurora.evaluate((element) => getComputedStyle(element).opacity));
    await page.waitForTimeout(150);
  }
  expect(opacities.size).toBeGreaterThan(1); // breathing

  await page.getByRole('combobox', { name: /^Background/ }).selectOption('off');
  await expect(aurora).toHaveCount(0);
  await page.getByRole('button', { name: "Let's go" }).click();
  await expect(page.getByPlaceholder('Paste API key')).toBeVisible();
  await expect(aurora).toHaveCount(0);
});

test('Background "Heartbeat monitor" draws a moving trace behind the content, and holds still for reduced motion', async ({ page }) => {
  await fakeApi(page, [defaultProject()]);
  await openApp(page, { storage: { 'healthchecks-pocket.lights': 'heartbeat' } });
  const canvas = page.locator('.heartbeat canvas');
  await expect(canvas).toBeAttached();
  await expect(page.locator('.aurora')).toHaveCount(0);
  await expect(page.locator('.heartbeat')).toHaveCSS('pointer-events', 'none'); // the list stays usable
  const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const blank = await canvas.evaluate((element: HTMLCanvasElement) => {
    const empty = document.createElement('canvas');
    empty.width = element.width;
    empty.height = element.height;
    return empty.toDataURL();
  });
  await expect.poll(pixels).not.toBe(blank); // something is drawn
  const before = await pixels();
  await expect.poll(pixels).not.toBe(before); // it's moving

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.heartbeat')).toHaveCSS('animation-name', 'none');
  // Polled: the media change reaches the page a moment later; from then on, a still trace, not nothing.
  let previous = '';
  await expect.poll(async () => {
    const current = await pixels();
    const unchanged = current === previous && current !== blank;
    previous = current;
    return unchanged;
  }, { intervals: [300] }).toBe(true);
  await page.waitForTimeout(400);
  expect(await pixels()).toBe(previous);
});

test.describe('the page for an outdated WebView (capacitor.config.ts errorPath)', () => {
  test.use({ javaScriptEnabled: false }); // as on a WebView too old for the app: the page must not need any

  test('says to update Android System WebView (or Chrome), with links to both on Google Play, and fits a narrow phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/webview-update-needed.html');
    await expect(page.getByRole('heading')).toHaveText('Please update Android System WebView');
    await expect(page.getByRole('link', { name: 'Update Android System WebView' }))
      .toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.google.android.webview');
    await expect(page.getByRole('link', { name: 'Update Chrome' }))
      .toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.android.chrome');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('Follow system tracks the system dark mode', async ({ page }) => {
  await fakeApi(page, [defaultProject()]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page, { storage: { 'healthchecks-pocket.theme': 'system' } });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171a21');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 247)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff');
});

test('a fresh install is dark, with breathing northern lights', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' }); // whatever the system says
  await page.clock.install({ time: new Date('2026-10-12T12:00:00+09:00') }); // midday
  await openApp(page, { projects: [], storage: { 'healthchecks-pocket.onboarded': '' } });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)');
  await expect(page.locator('.aurora')).toHaveClass(/aurora-breathing/);
  await expect(page.getByRole('combobox', { name: /^Theme/ })).toHaveValue('dark');
  await expect(page.getByRole('combobox', { name: /^Background/ })).toHaveValue('breathing');
});

test('Auto is dark in the evening and light by day, whatever the system says', async ({ page }) => {
  await fakeApi(page, [defaultProject()]);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.install({ time: new Date('2026-10-12T21:00:00+09:00') }); // Tokyo, the test zone
  await openApp(page, { storage: { 'healthchecks-pocket.theme': 'auto' } });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)');
  await page.clock.setSystemTime(new Date('2026-10-13T07:00:30+09:00'));
  await page.clock.runFor(60_000);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 247)');
});

test('a theme picked in Settings applies at once', async ({ page }) => {
  await fakeApi(page, [defaultProject()]);
  await openApp(page, { hash: '#/settings', storage: { 'healthchecks-pocket.theme': 'light' } });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 247)');
  await page.getByRole('combobox', { name: /^Theme/ }).selectOption('dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)');
});

test('ping bodies colour each log level differently', async ({ page }) => {
  await fakeApi(page, [defaultProject()]);
  await openApp(page, { hash: `#/check/${UUID}/ping/27` });
  await expect(page.locator('pre.body .line')).toHaveCount(5);
  const colour = (className: string) => page.locator(`pre.body .${className}`).first().evaluate((element) => getComputedStyle(element).color);
  const colours = await Promise.all(['line-error', 'line-warn', 'line-info', 'line-debug', 'line-plain'].map(colour));
  expect(new Set(colours).size).toBe(5);
});

test('ping body tools: copy, text size, pinch to zoom, wrapping', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const body = `short line\n[ERROR] ${'x'.repeat(200)}\n`;
  await fakeApi(page, [{ ...defaultProject(), bodies: { [`${UUID}/27`]: body } }]);
  await openApp(page, { hash: `#/check/${UUID}/ping/27` });
  const logBody = page.locator('pre.body');
  await expect(logBody.locator('.line')).toHaveCount(3);

  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(body);

  await page.getByRole('button', { name: 'Larger text' }).click();
  await expect(logBody).toHaveCSS('font-size', '14px');

  // A real two-finger pinch (fingers 60px -> 120px apart) doubles the size,
  // then it settles on the nearest step; the page itself doesn't zoom.
  const box = (await logBody.boundingBox())!;
  const y = box.y + 40;
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', gap: number) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: 150 - gap / 2, y, id: 1 }, { x: 150 + gap / 2, y, id: 2 }],
  });
  await touch('touchStart', 60);
  for (const gap of [80, 100, 120]) {
    await touch('touchMove', gap);
  }
  await expect(logBody).toHaveCSS('font-size', '28px');
  await touch('touchEnd', 0);
  await expect(logBody).toHaveCSS('font-size', '28px');
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);

  // Unwrapped, the long line scrolls inside the body; the page itself doesn't.
  await page.getByRole('button', { name: 'Wrap' }).click();
  expect(await logBody.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('ping body search scrolls to the match, sideways too when lines don\'t wrap, and keeps its line\'s colour', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const body = `${'line\n'.repeat(80)}[ERROR] ${'x'.repeat(300)} needle\n`;
  await fakeApi(page, [{ ...defaultProject(), bodies: { [`${UUID}/27`]: body } }]);
  await openApp(page, { hash: `#/check/${UUID}/ping/27` });
  const logBody = page.locator('pre.body');
  await page.getByRole('button', { name: 'Wrap' }).click();
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search the body' }).fill('needle');
  await expect(page.getByRole('status')).toHaveText('1 of 1');
  const currentMatch = logBody.locator('mark.body-match-current');
  await expect(currentMatch).toBeInViewport();
  expect(await logBody.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  // The page scrolled down to it, and the search stayed in sight just under the header, to step on from there.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const headerBox = (await page.locator('header').boundingBox())!;
  expect((await page.getByRole('search').boundingBox())!.y).toBeCloseTo(headerBox.y + headerBox.height, 0);
  const colour = (element: Element) => getComputedStyle(element).color;
  expect(await currentMatch.evaluate(colour)).toBe(await logBody.locator('.line-error').evaluate(colour));
  // The open search fits a narrow phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('a search match cut by a link\'s edge draws as one highlight, with no edge or rounded corner between its marks', async ({ page }) => {
  await fakeApi(page, [{ ...defaultProject(), bodies: { [`${UUID}/27`]: 'see https://a.example/x\n' } }]);
  await openApp(page, { hash: `#/check/${UUID}/ping/27` });
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search the body' }).fill('see https');
  await expect(page.getByRole('status')).toHaveText('1 of 1');
  const marks = page.locator('pre.body mark.body-match-current');
  await expect(marks).toHaveText(['see ', 'https']);
  const look = (mark: Element) => {
    const style = getComputedStyle(mark);
    const box = mark.getBoundingClientRect();
    return {
      left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
      boxShadow: style.boxShadow,
    };
  };
  const [before, after] = [await marks.nth(0).evaluate(look), await marks.nth(1).evaluate(look)];
  // The marks touch, on one row.
  expect(after.left).toBeCloseTo(before.right, 1);
  expect([after.top, after.bottom]).toEqual([before.top, before.bottom]);
  // Rounded and edged only on the outer side (the inset shadows are top, bottom, left, right).
  expect(before.radii).toEqual(['2px', '0px', '0px', '2px']);
  expect(after.radii).toEqual(['0px', '2px', '2px', '0px']);
  const edge = (x: number, y: number) => `rgb(255, 214, 102) ${x}px ${y}px 0px 0px inset`;
  expect(before.boxShadow).toBe([edge(0, 1), edge(0, -1), edge(1, 0), edge(0, 0)].join(', '));
  expect(after.boxShadow).toBe([edge(0, 1), edge(0, -1), edge(0, 0), edge(-1, 0)].join(', '));
});
