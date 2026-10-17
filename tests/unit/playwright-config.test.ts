// @vitest-environment node
// The browser tests' settings that decide whether a run passes.

import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPlaywrightConfig(ciValue: string | undefined) {
  vi.stubEnv('CI', ciValue);
  vi.resetModules(); // the config reads CI when it's imported
  return (await import('../../playwright.config')).default;
}

afterEach(() => vi.unstubAllEnvs());

describe('playwright.config', () => {
  it('on CI: retries a failed test once, and fails the run if a test passes only on the retry (flaky)', async () => {
    expect(await loadPlaywrightConfig('true')).toMatchObject({ retries: 1, failOnFlakyTests: true });
  });

  it('locally: no retries, so a flaky test fails at once', async () => {
    expect(await loadPlaywrightConfig(undefined)).toMatchObject({ retries: 0, failOnFlakyTests: false });
  });
});
