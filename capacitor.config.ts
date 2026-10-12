import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.yimaha.healthcheckspocket',
  appName: 'Healthchecks Pocket',
  webDir: 'dist',
  // Capacitor's default ('debug') logs every plugin call with its arguments
  // to logcat in debug builds, which would write API keys there in plain
  // text when they're saved to secure storage. Switch to 'debug' temporarily
  // when you need the logs.
  loggingBehavior: 'none',
};

export default config;
