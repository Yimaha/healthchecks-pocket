// Version 1 of the app settings: a key each, as saved before versions existed. Each is read as its reader did then: a
// value that's missing or isn't one of the choices is the default.

import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from '@/core/ping-body/textSizes';
import { DEFAULT_BACKGROUND_MODE, DEFAULT_THEME_MODE, parseBackgroundMode, parseThemeMode, type BackgroundMode, type ThemeMode } from '@/core/preferences/theme';
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

/** What a fresh install reads: nothing is saved. */
export const DEFAULT_APP_SETTINGS_V1: AppSettingsV1 = {
  onboarded: false,
  timeZoneChoice: SYSTEM_TZ,
  themeMode: DEFAULT_THEME_MODE,
  background: DEFAULT_BACKGROUND_MODE,
  pingBodyTextSize: DEFAULT_TEXT_SIZE,
  pingBodyWrapsLines: true,
  checkForUpdates: true,
  skippedUpdateVersion: null,
  lastUpdateCheckMs: null,
  openSections: { flips: true, pings: true },
  failNextProjectLoad: false,
};

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

/** The saved values of these app settings, as version 1 saves them: null removes the key. */
export function encodeAppSettingsV1(changedAppSettings: Partial<AppSettingsV1>): Partial<SavedAppSettingsV1> {
  const encodeFlag = (flag: boolean) => (flag ? '1' : '0');
  const savedAppSettingsV1: Partial<SavedAppSettingsV1> = {};
  if (changedAppSettings.onboarded !== undefined) {
    savedAppSettingsV1.onboarded = changedAppSettings.onboarded ? '1' : null;
  }
  if (changedAppSettings.timeZoneChoice !== undefined) {
    savedAppSettingsV1.timezone = changedAppSettings.timeZoneChoice;
  }
  if (changedAppSettings.themeMode !== undefined) {
    savedAppSettingsV1.theme = changedAppSettings.themeMode;
  }
  if (changedAppSettings.background !== undefined) {
    savedAppSettingsV1.lights = changedAppSettings.background;
  }
  if (changedAppSettings.pingBodyTextSize !== undefined) {
    savedAppSettingsV1['pingBody.size'] = String(changedAppSettings.pingBodyTextSize);
  }
  if (changedAppSettings.pingBodyWrapsLines !== undefined) {
    savedAppSettingsV1['pingBody.wrap'] = encodeFlag(changedAppSettings.pingBodyWrapsLines);
  }
  if (changedAppSettings.checkForUpdates !== undefined) {
    savedAppSettingsV1['updates.enabled'] = encodeFlag(changedAppSettings.checkForUpdates);
  }
  if (changedAppSettings.skippedUpdateVersion !== undefined) {
    savedAppSettingsV1['updates.skipped'] = changedAppSettings.skippedUpdateVersion;
  }
  if (changedAppSettings.lastUpdateCheckMs !== undefined) {
    savedAppSettingsV1['updates.lastCheck'] = changedAppSettings.lastUpdateCheckMs === null ? null : String(changedAppSettings.lastUpdateCheckMs);
  }
  if (changedAppSettings.openSections !== undefined) {
    for (const sectionId of FOLDING_SECTION_IDS) {
      savedAppSettingsV1[`section.${sectionId}`] = encodeFlag(changedAppSettings.openSections[sectionId]);
    }
  }
  if (changedAppSettings.failNextProjectLoad !== undefined) {
    savedAppSettingsV1['debug.failNextProjectLoad'] = changedAppSettings.failNextProjectLoad ? '1' : null;
  }
  return savedAppSettingsV1;
}
