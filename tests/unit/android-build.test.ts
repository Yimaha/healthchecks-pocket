// @vitest-environment node
// The Android build loads no Google services (Firebase) plugin: the app has no push notifications or other Firebase
// features for it to configure. Nor does it carry JUnit tests: the app's Android tests are tests/android, run with
// Playwright on the emulator, and Gradle's own test folders would only hold code that nothing runs.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRepoFile = (repoPath: string) => readFileSync(new URL(`../../${repoPath}`, import.meta.url), 'utf8');

describe('Android build', () => {
  it.each(['android/build.gradle', 'android/app/build.gradle'])('%s has no Google services plugin', (gradleFile) => {
    expect(readRepoFile(gradleFile)).not.toContain('google-services');
  });

  it('the app\'s Java code is all in the app\'s own package, and none of it is a JUnit test', () => {
    const appNamespace = readRepoFile('android/app/build.gradle').match(/namespace = "([^"]+)"/)![1];
    const appPackageFolder = `main/java/${appNamespace.replaceAll('.', '/')}/`;
    const javaSourcePaths = readdirSync(new URL('../../android/app/src', import.meta.url), { recursive: true, encoding: 'utf8' })
      .filter((sourcePath) => /\.(java|kt)$/.test(sourcePath));
    expect(javaSourcePaths).toContain(`${appPackageFolder}MainActivity.java`);
    expect(javaSourcePaths.filter((javaSourcePath) => !javaSourcePath.startsWith(appPackageFolder))).toEqual([]);
  });

  it('android/app/build.gradle sets up no JUnit or Espresso tests: no test dependencies, no test runner', () => {
    expect(readRepoFile('android/app/build.gradle')).not.toMatch(/testImplementation|androidTestImplementation|testInstrumentationRunner/);
  });
});
