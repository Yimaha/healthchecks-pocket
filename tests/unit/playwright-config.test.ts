// @vitest-environment node
// The browser and emulator tests' settings that decide whether a run passes.

import { afterEach, describe, expect, it, vi } from 'vitest';

const configs = {
  'playwright.config': () => import('../../playwright.config'),
  'playwright.android.config': () => import('../../playwright.android.config'),
};

async function loadPlaywrightConfig(name: keyof typeof configs, ciValue: string | undefined) {
  vi.stubEnv('CI', ciValue);
  vi.resetModules(); // the config reads CI when it's imported
  return (await configs[name]()).default;
}

afterEach(() => vi.unstubAllEnvs());

describe.each(Object.keys(configs) as (keyof typeof configs)[])('%s', (name) => {
  it('on CI: retries a failed test once, and fails the run if a test passes only on the retry (flaky)', async () => {
    expect(await loadPlaywrightConfig(name, 'true')).toMatchObject({ retries: 1, failOnFlakyTests: true });
  });

  it('locally: no retries, so a flaky test fails at once', async () => {
    expect(await loadPlaywrightConfig(name, undefined)).toMatchObject({ retries: 0, failOnFlakyTests: false });
  });
});
