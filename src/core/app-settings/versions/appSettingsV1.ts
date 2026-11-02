// Version 1 of the app settings: a key each, as saved before versions existed. Each is read as its reader did then: a
// value that's missing or isn't one of the choices is the default.

import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from '@/core/ping-body/textSizes';
import { parseBackgroundMode, parseThemeMode, type BackgroundMode, type ThemeMode } from '@/core/preferences/theme';
import { SYSTEM_TZ } from '@/core/preferences/timezones';
import type { SettingKey } from '@/core/storage/storage';

/** The sections that fold (`Section`), each remembered as open or folded. */
export const FOLDING_SECTION_IDS = ['flips', 'pings'] as const;

export type FoldingSectionId = (typeof FOLDING_SECTION_IDS)[number];

/** Everything the app saves about itself, apart from the projects (versioned on their own) and their API keys, and
 *  the check icons. */
export interface AppSettingsV1 {
  /** First-launch setup is done. */
  onboarded: boolean;
  /** SYSTEM_TZ or an IANA zone. */
  timeZoneChoice: string;
  themeMode: ThemeMode;
  background: BackgroundMode;
  pingBodyTextSize: number;
  pingBodyWrapsLines: boolean;
  checkForUpdates: boolean;
  /** The version the person chose to skip; null when none. */
  skippedUpdateVersion: string | null;
  /** When updates were last checked for, in ms since the epoch; null when never. */
  lastUpdateCheckMs: number | null;
  openSections: Record<FoldingSectionId, boolean>;
  /** The next load of the saved projects fails once (Risky actions > Debug). */
  failNextProjectLoad: boolean;
}

/** Every key version 1 saves, each as saved: null when missing. */
export type SavedAppSettingsV1 = Record<AppSettingsV1Key, string | null>;

export type AppSettingsV1Key = (typeof APP_SETTINGS_V1_KEYS)[number];

export const APP_SETTINGS_V1_KEYS = [
  'onboarded',
  'timezone',
  'theme',
  'lights',
  'pingBody.size',
  'pingBody.wrap',
  'updates.enabled',
  'updates.skipped',
  'updates.lastCheck',
  ...FOLDING_SECTION_IDS.map((sectionId) => `section.${sectionId}` as const),
  'debug.failNextProjectLoad',
] as const satisfies readonly SettingKey[];

export function decodeAppSettingsV1(savedAppSettingsV1: SavedAppSettingsV1): AppSettingsV1 {
  return {
    onboarded: !!savedAppSettingsV1.onboarded,
    timeZoneChoice: savedAppSettingsV1.timezone || SYSTEM_TZ,
    themeMode: parseThemeMode(savedAppSettingsV1.theme),
    // Saved as `lights`, named when the northern lights were the only background.
    background: parseBackgroundMode(savedAppSettingsV1.lights),
    pingBodyTextSize: decodeTextSize(savedAppSettingsV1['pingBody.size']),
    pingBodyWrapsLines: decodeFlag(savedAppSettingsV1['pingBody.wrap'], true),
    // On unless the person turned it off.
    checkForUpdates: savedAppSettingsV1['updates.enabled'] !== '0',
    skippedUpdateVersion: savedAppSettingsV1['updates.skipped'],
    lastUpdateCheckMs: Number(savedAppSettingsV1['updates.lastCheck']) || null,
    openSections: {
      flips: decodeFlag(savedAppSettingsV1['section.flips'], true),
      pings: decodeFlag(savedAppSettingsV1['section.pings'], true),
    },
    failNextProjectLoad: savedAppSettingsV1['debug.failNextProjectLoad'] === '1',
  };
}

/** Saved as '1' or '0'; `whenMissing` when not saved. */
function decodeFlag(savedFlag: string | null, whenMissing: boolean): boolean {
  return savedFlag === null ? whenMissing : savedFlag === '1';
}

/** One of the text sizes' range, a whole number; else the default. */
function decodeTextSize(savedTextSize: string | null): number {
  const textSize = Number(savedTextSize);
  if (savedTextSize !== null && Number.isInteger(textSize) && textSize >= TEXT_SIZES[0] && textSize <= TEXT_SIZES[TEXT_SIZES.length - 1]) {
    return textSize;
  }
  return DEFAULT_TEXT_SIZE;
}
