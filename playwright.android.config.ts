import { defineConfig } from '@playwright/test';

// The real Android app on an emulator (tests/android): `scripts/android.sh test` builds and installs the debug app,
// then runs these. One test at a time, as they share the emulator and each starts the app afresh.
export default defineConfig({
  testDir: 'tests/android',
  outputDir: 'test-results/android',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 }, // an emulator without hardware acceleration is slow
  forbidOnly: !!process.env.CI,
  // As in playwright.config.ts: a failed test runs once more on CI, but passing only on that retry fails the run.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
});
