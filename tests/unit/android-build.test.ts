// @vitest-environment node
// The Android build loads no Google services (Firebase) plugin: the app has no push notifications or other Firebase
// features for it to configure.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Android build', () => {
  it.each(['android/build.gradle', 'android/app/build.gradle'])('%s has no Google services plugin', (gradleFile) => {
    expect(readFileSync(new URL(`../../${gradleFile}`, import.meta.url), 'utf8')).not.toContain('google-services');
  });
});
