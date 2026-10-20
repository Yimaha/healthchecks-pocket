// What the Android app does through Capacitor's plugins beyond storage (native-storage.test.ts): links, the clipboard,
// the share sheet, the status bar's icons and the Back button. Faked plugins stand in for the real ones, which only
// run on a phone (the emulator tests cover those).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const pluginFakes = vi.hoisted(() => ({
  /** The Back button's listener, as the app registers it with the App plugin. */
  backButtonListeners: [] as (() => void)[],
  exitApp: vi.fn(),
  openInBrowser: vi.fn(async (_options: { url: string }) => {}),
  writeToClipboard: vi.fn(async (_options: { string: string }) => {}),
  openShareSheet: vi.fn(async (_options: { title: string; text: string; dialogTitle: string }) => {}),
  setStatusBarStyle: vi.fn(async (_options: { style: string }) => {}),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (eventName: string, listener: () => void) => { if (eventName === 'backButton') pluginFakes.backButtonListeners.push(listener); },
    exitApp: pluginFakes.exitApp,
  },
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: pluginFakes.openInBrowser } }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { write: pluginFakes.writeToClipboard } }));
vi.mock('@capacitor/share', () => ({ Share: { share: pluginFakes.openShareSheet } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: {} }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: { setKeyPrefix: async () => {} } }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  SystemBars: { setStyle: pluginFakes.setStatusBarStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

const { nativePlatform } = await import('../../src/platform/native');

/** How far the WebView draws under the status bar: Capacitor's --safe-area-inset-top, 0 when it's inset below it. */
const setStatusBarInset = (insetPx: number) => document.documentElement.style.setProperty('--safe-area-inset-top', `${insetPx}px`);
const statusBarStyles = () => pluginFakes.setStatusBarStyle.mock.calls.map(([statusBarOptions]) => statusBarOptions.style);

beforeEach(() => {
  for (const pluginFake of [pluginFakes.exitApp, pluginFakes.openInBrowser, pluginFakes.writeToClipboard, pluginFakes.openShareSheet, pluginFakes.setStatusBarStyle]) {
    pluginFake.mockClear();
  }
  setStatusBarInset(0);
});

describe('status bar icons', () => {
  // First: before the app has set them, a resize leaves them alone.
  it('are set again when the window resizes (the insets arrive late, or the phone turns), once the app has set them', () => {
    window.dispatchEvent(new Event('resize'));
    expect(statusBarStyles()).toEqual([]);
    nativePlatform.setDarkBars(true);
    setStatusBarInset(24);
    window.dispatchEvent(new Event('resize'));
    expect(statusBarStyles()).toEqual(['DEFAULT', 'DARK']);
  });

  it('follow the app\'s theme when the app draws under the status bar', () => {
    setStatusBarInset(24);
    nativePlatform.setDarkBars(true);
    nativePlatform.setDarkBars(false);
    expect(statusBarStyles()).toEqual(['DARK', 'LIGHT']);
  });

  it('keep the system\'s colour when the app is inset below the bar, which then shows the system\'s background', () => {
    nativePlatform.setDarkBars(true);
    expect(statusBarStyles()).toEqual(['DEFAULT']);
  });

  it('a failure to set them changes nothing else', async () => {
    pluginFakes.setStatusBarStyle.mockRejectedValueOnce(new Error('not implemented on this Android version'));
    nativePlatform.setDarkBars(true);
    await Promise.resolve(); // (an unhandled rejection would fail the test)
    expect(statusBarStyles()).toEqual(['DEFAULT']);
  });
});

describe('the Back button', () => {
  it('goes back a screen, or from the check list leaves the app', () => {
    const goBack = vi.spyOn(history, 'back').mockImplementation(() => {});
    const [onBackButton] = pluginFakes.backButtonListeners;
    window.location.hash = '#/check/uuid-1';
    onBackButton();
    expect([goBack.mock.calls.length, pluginFakes.exitApp.mock.calls.length]).toEqual([1, 0]);
    for (const checkListHash of ['#/', '']) {
      window.location.hash = checkListHash;
      onBackButton();
    }
    expect([goBack.mock.calls.length, pluginFakes.exitApp.mock.calls.length]).toEqual([1, 2]);
  });
});

describe('links, clipboard and sharing', () => {
  it('opens a link in the browser plugin', () => {
    nativePlatform.openExternal('https://healthchecks.io/projects/');
    expect(pluginFakes.openInBrowser).toHaveBeenCalledWith({ url: 'https://healthchecks.io/projects/' });
  });

  it('copies text to the clipboard', async () => {
    await nativePlatform.copyText('https://hc-ping.com/uuid-1');
    expect(pluginFakes.writeToClipboard).toHaveBeenCalledWith({ string: 'https://hc-ping.com/uuid-1' });
  });

  it('shares text through the share sheet, titled', async () => {
    await nativePlatform.shareText!('nightly backup', 'Ping body');
    expect(pluginFakes.openShareSheet).toHaveBeenCalledWith({ title: 'nightly backup', text: 'Ping body', dialogTitle: 'nightly backup' });
  });

  it('closing the share sheet without picking an app isn\'t an error; anything else is', async () => {
    pluginFakes.openShareSheet.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(nativePlatform.shareText!('nightly backup', 'Ping body')).resolves.toBeUndefined();
    const noShareTarget = new Error('No app can share this');
    pluginFakes.openShareSheet.mockRejectedValueOnce(noShareTarget);
    await expect(nativePlatform.shareText!('nightly backup', 'Ping body')).rejects.toBe(noShareTarget);
  });
});
