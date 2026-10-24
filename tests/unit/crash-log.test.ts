import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '@/core/app';
import { buildCrashLog } from '@/core/diagnostics/crashLog';

const storageError = Object.assign(new Error('Storage unavailable'), { stack: 'Error: Storage unavailable\n    at loadProjects (projects.ts:20:3)' });

describe('crash log', () => {
  it('says which version, when, on which screen, what failed and on what device, then the stack', () => {
    const crashLog = buildCrashLog({
      whatFailed: "Couldn't load your projects",
      error: storageError,
      screenName: 'list',
      occurredAt: new Date('2026-10-16T08:30:00Z'),
      userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/141',
    });
    expect(crashLog).toBe([
      `Healthchecks Pocket ${APP_VERSION}`,
      'When: 2026-10-16T08:30:00.000Z',
      'Screen: list',
      "What failed: Couldn't load your projects",
      'Error: Error: Storage unavailable',
      'Device: Mozilla/5.0 (Linux; Android 15) Chrome/141',
      '',
      'Stack:',
      'Error: Storage unavailable',
      '    at loadProjects (projects.ts:20:3)',
    ].join('\n'));
  });

  it('adds the screen parts React was drawing, for a screen that crashed', () => {
    const crashLog = buildCrashLog({
      whatFailed: 'Something went wrong',
      error: new TypeError("Cannot read properties of undefined (reading 'replace')"),
      componentStack: '\n    at Settings\n    at ScreenForRoute\n',
      screenName: 'settings',
      occurredAt: new Date('2026-10-16T08:30:00Z'),
      userAgent: 'test',
    });
    expect(crashLog).toContain("Error: TypeError: Cannot read properties of undefined (reading 'replace')");
    expect(crashLog.endsWith('Screen parts (React):\nat Settings\n    at ScreenForRoute')).toBe(true);
  });

  it('leaves out a stack the error doesn\'t have', () => {
    const errorWithoutStack = Object.assign(new Error('Storage locked'), { stack: undefined });
    const crashLog = buildCrashLog({ whatFailed: 'x', error: errorWithoutStack, screenName: 'list', occurredAt: new Date(0), userAgent: 'test' });
    expect(crashLog).not.toContain('Stack:');
  });
});
