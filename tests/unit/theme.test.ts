import { describe, expect, it } from 'vitest';
import { parseLightsMode, parseThemeMode, resolveTheme } from '../../src/core/theme';

// Tests run in Asia/Tokyo; these are local times.
const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00`);

describe('theme', () => {
  it.each([
    ['06:59', 'dark'], ['07:00', 'light'], ['12:00', 'light'], ['18:59', 'light'], ['19:00', 'dark'], ['23:30', 'dark'], ['00:00', 'dark'],
  ])('auto at %s is %s', (time, theme) => {
    expect(resolveTheme('auto', at(time), false)).toBe(theme);
    expect(resolveTheme('auto', at(time), true)).toBe(theme); // the system setting doesn't matter
  });

  it('light and dark are fixed, whatever the time or system', () => {
    for (const time of ['03:00', '12:00']) {
      expect(resolveTheme('light', at(time), true)).toBe('light');
      expect(resolveTheme('dark', at(time), false)).toBe('dark');
    }
  });

  it('follow system uses the system setting, whatever the time', () => {
    expect(resolveTheme('system', at('12:00'), true)).toBe('dark');
    expect(resolveTheme('system', at('23:00'), false)).toBe('light');
  });

  it('reads a saved mode, defaulting to dark', () => {
    expect(parseThemeMode('light')).toBe('light');
    expect(parseThemeMode('system')).toBe('system');
    expect(parseThemeMode(null)).toBe('dark');
    expect(parseThemeMode('purple')).toBe('dark');
  });

  it('reads a saved background, defaulting to breathing northern lights', () => {
    expect(parseLightsMode('always')).toBe('always');
    expect(parseLightsMode('off')).toBe('off');
    expect(parseLightsMode(null)).toBe('breathing');
    expect(parseLightsMode('rainbow')).toBe('breathing');
  });
});
