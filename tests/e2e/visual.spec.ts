// Things only a real browser rendering the production CSS can check: the
// minifier once reordered `font` after `font-variant-numeric`, silently
// resetting tabular digits, so these run against `vite build` output.

import { defaultProject, expect, fakeApi, freezeClock, homeAccount, openApp, test, UUID } from './fixtures'

test('ticking times keep a constant width (tabular digits survive the build)', async ({ page }) => {
  await freezeClock(page)
  await fakeApi(page, [defaultProject()])
  await openApp(page)
  const meta = page.locator('.check-row', { hasText: 'backup-server' }).locator('.check-meta')
  await expect(meta).toHaveText('last ping 5m 00s ago · next in 55m 00s')
  await expect(meta).toHaveCSS('font-variant-numeric', 'tabular-nums')

  const width = () => meta.evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    return Math.round(r.getBoundingClientRect().width * 100) / 100
  })
  const widths = new Set<number>()
  const texts = new Set<string>()
  for (let i = 0; i < 12; i++) {
    widths.add(await width())
    texts.add((await meta.textContent()) ?? '')
    await page.clock.runFor(1000)
  }
  expect(texts.size).toBeGreaterThan(10) // it really ticked
  expect([...widths]).toHaveLength(1)
})

test('the refresh icon spins around its own centre, with a progress bar', async ({ page }) => {
  await fakeApi(page, [defaultProject()], { delayMs: 1200 })
  await openApp(page)
  await expect(page.locator('.check-row')).toHaveCount(2, { timeout: 5000 })
  const button = page.getByRole('button', { name: 'Refresh' })
  await button.click()
  await expect(page.getByRole('progressbar', { name: 'Refreshing' })).toBeVisible()
  const icon = button.locator('svg')
  await expect(icon).toHaveClass(/spinning/)
  const centres = new Set<string>()
  const angles = new Set<string>()
  for (let i = 0; i < 6; i++) {
    const s = await icon.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { c: `${(r.x + r.width / 2).toFixed(1)},${(r.y + r.height / 2).toFixed(1)}`, t: getComputedStyle(el).transform }
    })
    centres.add(s.c)
    angles.add(s.t)
    await page.waitForTimeout(60)
  }
  expect(angles.size).toBeGreaterThan(1) // it's rotating
  expect([...centres]).toHaveLength(1) // around a fixed centre
  await expect(page.getByRole('progressbar')).toBeHidden({ timeout: 5000 })
})

test('bar labels stay on one line, even on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await fakeApi(page, [defaultProject()])
  await openApp(page)
  const labels = page.locator('.project-bar-label')
  await expect(labels).toHaveText(['Project', 'Time zone'])
  for (const h of await labels.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(h).toBeLessThan(24)
  }
})

test('project rows in Settings stay on one line each, even with long names, on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await fakeApi(page, [defaultProject()])
  const long = { ...homeAccount, id: 'p2', name: 'A rather long project name for the backups', baseUrl: 'https://healthchecks.some-long-domain.example.org' }
  await openApp(page, { hash: '#/settings', accounts: [homeAccount, long] })
  const lines = page.locator('.project-select-row .check-name, .project-select-row .check-meta')
  await expect(lines).toHaveCount(4)
  for (const height of await lines.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(height).toBeLessThan(26) // a single line
  }
  await expect(page.getByRole('link', { name: /^Edit A rather long/ })).toBeVisible()
})

test('no screen scrolls sideways on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await fakeApi(page, [defaultProject()])
  for (const hash of ['#/', `#/check/${UUID}`, `#/check/${UUID}/ping/27`, '#/settings', '#/settings/add', '#/settings/project/p1']) {
    await openApp(page, { hash })
    await expect(page.locator('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, hash).toBeLessThanOrEqual(0)
  }
})

test('onboarding fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await openApp(page, { accounts: [], storage: { 'healthchecks-pocket.onboarded': '' } })
  await expect(page.getByRole('button', { name: "Let's go" })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('northern lights drift behind onboarding, and hold still for reduced motion', async ({ page }) => {
  await openApp(page, { accounts: [], storage: { 'healthchecks-pocket.onboarded': '' } })
  const light = page.locator('.aurora span').first()
  await expect(light).toBeAttached()
  const transform = () => light.evaluate((el) => getComputedStyle(el).transform)
  const before = await transform()
  await page.waitForTimeout(400)
  expect(await transform()).not.toBe(before) // it's moving
  // Behind the content: the welcome text and buttons stay usable.
  await expect(page.locator('.aurora')).toHaveCSS('pointer-events', 'none')
  // Carries on into adding the first project: the same lights, not restarted.
  await page.locator('.aurora').evaluate((el) => { el.dataset.mark = 'same' })
  await page.getByRole('button', { name: "Let's go" }).click()
  await expect(page.getByPlaceholder('Paste API key')).toBeVisible()
  await expect(page.locator('.aurora')).toHaveAttribute('data-mark', 'same')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(light).toHaveCSS('animation-name', 'none')
})

test('northern lights "while loading" show while the list refreshes, then fade away', async ({ page }) => {
  await fakeApi(page, [defaultProject()], { delayMs: 1500 })
  await openApp(page, { storage: { 'healthchecks-pocket.lights': 'loading' } })
  const lights = page.locator('.aurora-loading')
  await expect(lights).toBeAttached() // first load
  await expect(page.locator('.check-row')).toHaveCount(2, { timeout: 5000 })
  await expect(lights).toBeHidden({ timeout: 5000 })
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(lights).toBeAttached()
  // Fades out (opacity passes between 1 and 0) rather than vanishing.
  await expect(page.locator('.aurora-leaving')).toBeAttached({ timeout: 6000 })
  const opacities = new Set<number>()
  for (let i = 0; i < 12; i++) {
    const o = await page.evaluate(() => {
      const el = document.querySelector('.aurora-loading')
      return el ? Number(getComputedStyle(el).opacity) : null
    })
    if (o !== null) opacities.add(o)
    await page.waitForTimeout(40)
  }
  expect([...opacities].some((o) => o > 0 && o < 1), [...opacities].join()).toBe(true)
  await expect(lights).toBeHidden({ timeout: 6000 })
})

test('Background "breathing" fades the lights on and off; "None" shows none, even during setup', async ({ page }) => {
  await openApp(page, { accounts: [], storage: { 'healthchecks-pocket.onboarded': '', 'healthchecks-pocket.lights': 'breathing' } })
  const aurora = page.locator('.aurora')
  await expect(aurora).toHaveClass(/aurora-breathing/)
  const opacities = new Set<string>()
  for (let i = 0; i < 8; i++) {
    opacities.add(await aurora.evaluate((el) => getComputedStyle(el).opacity))
    await page.waitForTimeout(150)
  }
  expect(opacities.size).toBeGreaterThan(1) // breathing

  await page.getByRole('combobox', { name: /^Background/ }).selectOption('off')
  await expect(aurora).toHaveCount(0)
  await page.getByRole('button', { name: "Let's go" }).click()
  await expect(page.getByPlaceholder('Paste API key')).toBeVisible()
  await expect(aurora).toHaveCount(0)
})

test('Follow system tracks the system dark mode', async ({ page }) => {
  await fakeApi(page, [defaultProject()])
  await page.emulateMedia({ colorScheme: 'dark' })
  await openApp(page, { storage: { 'healthchecks-pocket.theme': 'system' } })
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171a21')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 247)')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff')
})

test('Auto (the default) is dark in the evening and light by day, whatever the system says', async ({ page }) => {
  await fakeApi(page, [defaultProject()])
  await page.emulateMedia({ colorScheme: 'light' })
  await page.clock.install({ time: new Date('2026-10-12T21:00:00+09:00') }) // Tokyo, the test zone
  await openApp(page)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)')
  await page.clock.setSystemTime(new Date('2026-10-13T07:00:30+09:00'))
  await page.clock.runFor(60_000)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 247)')
})

test('a theme picked in Settings applies at once', async ({ page }) => {
  await fakeApi(page, [defaultProject()])
  await openApp(page, { hash: '#/settings', storage: { 'healthchecks-pocket.theme': 'light' } })
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 245, 247)')
  await page.getByRole('combobox', { name: /^Theme/ }).selectOption('dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 19)')
})

test('ping bodies colour each log level differently', async ({ page }) => {
  await fakeApi(page, [defaultProject()])
  await openApp(page, { hash: `#/check/${UUID}/ping/27` })
  await expect(page.locator('pre.body .line')).toHaveCount(5)
  const colour = (cls: string) => page.locator(`pre.body .${cls}`).first().evaluate((el) => getComputedStyle(el).color)
  const colours = await Promise.all(['line-error', 'line-warn', 'line-info', 'line-debug', 'line-plain'].map(colour))
  expect(new Set(colours).size).toBe(5)
})

test('ping body tools: copy, text size, pinch to zoom, wrapping', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const body = `short line\n[ERROR] ${'x'.repeat(200)}\n`
  await fakeApi(page, [{ ...defaultProject(), bodies: { [`${UUID}/27`]: body } }])
  await openApp(page, { hash: `#/check/${UUID}/ping/27` })
  const pre = page.locator('pre.body')
  await expect(pre.locator('.line')).toHaveCount(3)

  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByRole('status')).toHaveText('Copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(body)

  await page.getByRole('button', { name: 'Larger text' }).click()
  await expect(pre).toHaveCSS('font-size', '14px')

  // A real two-finger pinch (fingers 60px -> 120px apart) doubles the size,
  // then it settles on the nearest step; the page itself doesn't zoom.
  const box = (await pre.boundingBox())!
  const y = box.y + 40
  const cdp = await context.newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', gap: number) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: 150 - gap / 2, y, id: 1 }, { x: 150 + gap / 2, y, id: 2 }],
  })
  await touch('touchStart', 60)
  for (const gap of [80, 100, 120]) await touch('touchMove', gap)
  await expect(pre).toHaveCSS('font-size', '28px')
  await touch('touchEnd', 0)
  await expect(pre).toHaveCSS('font-size', '28px')
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1)

  // Unwrapped, the long line scrolls inside the body; the page itself doesn't.
  await page.getByRole('button', { name: 'Wrap' }).click()
  expect(await pre.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})
