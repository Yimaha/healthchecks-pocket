import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the production build (`vite build` + preview), in a
// phone-sized Chromium. healthchecks.io is faked per test (tests/fixtures/fake-api.ts),
// so they need no network or account.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // On CI a failed test runs once more, so its trace shows whether it fails every time, but passing only on that retry
  // (flaky) still fails the run: a retry alone let flaky tests pass there unnoticed.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173',
    locale: 'en-US',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'pixel-7', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
