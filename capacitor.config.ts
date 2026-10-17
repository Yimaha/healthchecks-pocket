import type { CapacitorConfig } from '@capacitor/cli';

/** The oldest Android WebView (Chromium) version the app runs on: the CSS uses color-mix(), new in 111. The build
 *  targets it too (vite.config.ts), so the JavaScript never needs a newer one. */
export const MIN_WEBVIEW_VERSION = 111;

const config: CapacitorConfig = {
  appId: 'io.github.yimaha.healthcheckspocket',
  appName: 'Healthchecks Pocket',
  webDir: 'dist',
  // On an older WebView the app would load to a blank screen, so Capacitor shows this page instead (plain HTML, no
  // JavaScript, so any WebView can show it). Without errorPath Capacitor only logs a warning and loads the app anyway.
  android: { minWebViewVersion: MIN_WEBVIEW_VERSION },
  server: { errorPath: 'webview-update-needed.html' },
  // Capacitor's default ('debug') logs every plugin call with its arguments
  // to logcat in debug builds, which would write API keys there in plain
  // text when they're saved to secure storage. Switch to 'debug' temporarily
  // when you need the logs.
  loggingBehavior: 'none',
};

export default config;
