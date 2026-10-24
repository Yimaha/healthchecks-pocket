// The crash log on the error screens, for pasting into a bug report. It adds
// no saved data (no API keys or project names) and names the screen
// rather than its address, which for a check holds its ping UUID. The error's
// own message is kept as is, so the screen asks to read it before sharing.

import { APP_NAME, APP_VERSION } from './app';

export interface CrashDetails {
  whatFailed: string; // the error screen's title, e.g. "Couldn't load your projects"
  error: Error;
  componentStack?: string; // from React, when a screen crashed while drawing
  screenName: string; // the route's name, e.g. "settings"
  occurredAt: Date;
  userAgent: string; // Android and WebView versions
}

export function buildCrashLog(crash: CrashDetails): string {
  const crashLogLines = [
    `${APP_NAME} ${APP_VERSION}`,
    `When: ${crash.occurredAt.toISOString()}`,
    `Screen: ${crash.screenName}`,
    `What failed: ${crash.whatFailed}`,
    `Error: ${crash.error.name}: ${crash.error.message}`,
    `Device: ${crash.userAgent}`,
  ];
  if (crash.error.stack) {
    crashLogLines.push('', 'Stack:', crash.error.stack);
  }
  if (crash.componentStack) {
    crashLogLines.push('', 'Screen parts (React):', crash.componentStack.trim());
  }
  return crashLogLines.join('\n');
}
