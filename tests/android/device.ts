// Shared setup for the emulator tests: the real Android app (the debug build, installed by
// `scripts/android.sh test`), driven through its WebView with Playwright's Android support. Each test starts the app
// afresh, with its data cleared, so these refuse to run on a real phone. healthchecks.io is faked by intercepting the
// WebView's requests (tests/fixtures/fake-api.ts), so no real server or key is needed.
//
// Back is pressed with `adb shell input keyevent`, so Playwright's Android driver app (which its own `device.input`
// needs) isn't installed on the emulator.

import { _android, test as base, expect, type AndroidDevice, type Page } from '@playwright/test';
import capacitorConfig from '../../capacitor.config';

export { expect };

export const APP_ID = capacitorConfig.appId!;

/** shared_prefs/ files: Preferences' own groups (src/platform/native.ts) and the secure storage plugin's. */
export const SETTINGS_FILE = 'CapacitorStorage.xml';
export const CARRIED_KEYS_FILE = 'CarriedApiKeys.xml';
export const SECURE_STORAGE_FILE = 'WSSecureStorageSharedPreferences.xml';

interface AppFixtures {
  /** shared_prefs/ files to write before the app starts, by file name: the data an older version left behind. */
  savedPrefs: Record<string, string> | undefined;
  /** The app's page, started afresh for the test. */
  page: Page;
}

export const test = base.extend<AppFixtures, { device: AndroidDevice }>({
  // Fixtures get their value through `provide` (Playwright's `use`, renamed so oxlint doesn't take it for a React hook).
  device: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern
    async ({}, provide) => {
      const devices = await _android.devices({ omitDriverInstall: true });
      const serial = process.env.ANDROID_SERIAL;
      const device = devices.find((candidate) => (serial ? candidate.serial() === serial : candidate.serial().startsWith('emulator-')));
      if (!device) throw new Error(`No emulator found${serial ? ` with serial ${serial}` : ''}. Start one with: scripts/android.sh emulator`);
      // Every test clears the app's data, which on a real phone would delete its projects and API keys.
      if ((await shell(device, 'getprop ro.kernel.qemu')).trim() !== '1') throw new Error(`${device.serial()} is a real device; these tests run on the emulator only.`);
      await shell(device, 'logcat -c');
      await provide(device);
      for (const each of devices) await each.close();
    },
    { scope: 'worker' },
  ],

  savedPrefs: [undefined, { option: true }],

  page: async ({ device, savedPrefs }, provide, testInfo) => {
    await shell(device, `am force-stop ${APP_ID}`);
    await shell(device, `pm clear ${APP_ID}`);
    for (const [fileName, xml] of Object.entries(savedPrefs ?? {})) {
      await runAs(device, `mkdir -p shared_prefs && echo ${Buffer.from(xml).toString('base64')} | base64 -d > shared_prefs/${fileName}`);
    }
    await shell(device, `am start -W -n ${APP_ID}/.MainActivity`);
    // The WebView of this run of the app (its DevTools socket is named after the process), not the one before.
    const pid = (await shell(device, `pidof ${APP_ID}`)).trim();
    const webView = await device.webView({ pkg: APP_ID, socketName: `webview_devtools_remote_${pid}` });
    const page = await webView.page();

    await provide(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('screen.png', { body: await device.screenshot(), contentType: 'image/png' });
      await testInfo.attach('logcat.txt', { body: await shell(device, 'logcat -d'), contentType: 'text/plain' });
    }
    await shell(device, `am force-stop ${APP_ID}`);
  },
});

export async function shell(device: AndroidDevice, command: string): Promise<string> {
  return (await device.shell(command)).toString();
}

/** A shell command run as the app (debug builds only), in its data directory. */
export function runAs(device: AndroidDevice, command: string): Promise<string> {
  return shell(device, `run-as ${APP_ID} sh -c '${command}'`);
}

/** The app's shared_prefs/ files, by name. */
export async function sharedPrefs(device: AndroidDevice): Promise<Record<string, string>> {
  const fileNames = (await runAs(device, 'ls shared_prefs')).split(/\s+/).filter((fileName) => fileName.endsWith('.xml'));
  const files: Record<string, string> = {};
  for (const fileName of fileNames) files[fileName] = await runAs(device, `cat shared_prefs/${fileName}`);
  return files;
}

/** Android's Back button, as on the phone. */
export async function pressBack(device: AndroidDevice): Promise<void> {
  await shell(device, 'input keyevent KEYCODE_BACK');
}

/** The lines of logcat since the tests started (the device fixture clears it) that contain `text`. */
export async function logcatLinesWith(device: AndroidDevice, text: string): Promise<string[]> {
  return (await shell(device, 'logcat -d')).split('\n').filter((line) => line.includes(text));
}

/** A Preferences file as Android writes it, with these string values. */
export function prefsXml(values: Record<string, string>): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const entries = Object.entries(values).map(([name, value]) => `    <string name="${escape(name)}">${escape(value)}</string>\n`);
  return `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n${entries.join('')}</map>\n`;
}
