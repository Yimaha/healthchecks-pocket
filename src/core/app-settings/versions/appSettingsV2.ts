// Version 2 of the app settings: one object, `appSettings.v2`, saved by the versions after 0.5.7. Each setting is
// saved under its own name in it, so the background is `background`, no longer `lights`.

import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from '@/core/ping-body/textSizes';
import { DEFAULT_BACKGROUND_MODE, DEFAULT_THEME_MODE, parseBackgroundMode, parseThemeMode, type BackgroundMode, type ThemeMode } from '@/core/preferences/theme';
import { SYSTEM_TZ } from '@/core/preferences/timezones';
import type { SettingKey } from '@/core/storage/storage';
import { FOLDING_SECTION_IDS, type FoldingSectionId } from './appSettingsV1';

export const APP_SETTINGS_V2_KEY = 'appSettings.v2' satisfies SettingKey;

/** Everything the app saves about itself, apart from the projects (versioned on their own) and their API keys, and
 *  the check icons. */
export interface AppSettingsV2 {
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
export const DEFAULT_APP_SETTINGS_V2: AppSettingsV2 = {
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

/** A setting that's missing or damaged (not JSON, or not one of its values) is read as its default, as each was in
 *  version 1: a damaged view choice isn't worth stopping the app for. */
export function decodeAppSettingsV2(appSettingsV2Json: string): AppSettingsV2 {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(appSettingsV2Json);
  } catch {
    parsedJson = {};
  }
  const savedAppSettings = asObject(parsedJson);
  const savedOpenSections = asObject(savedAppSettings.openSections);
  const savedOr = <T>(savedValue: unknown, isValid: (candidate: unknown) => candidate is T, defaultValue: T): T => (isValid(savedValue) ? savedValue : defaultValue);
  return {
    onboarded: savedOr(savedAppSettings.onboarded, isBoolean, DEFAULT_APP_SETTINGS_V2.onboarded),
    timeZoneChoice: savedOr(savedAppSettings.timeZoneChoice, isNonEmptyString, DEFAULT_APP_SETTINGS_V2.timeZoneChoice),
    themeMode: parseThemeMode(savedOr(savedAppSettings.themeMode, isNonEmptyString, null)),
    background: parseBackgroundMode(savedOr(savedAppSettings.background, isNonEmptyString, null)),
    pingBodyTextSize: savedOr(savedAppSettings.pingBodyTextSize, isTextSize, DEFAULT_APP_SETTINGS_V2.pingBodyTextSize),
    pingBodyWrapsLines: savedOr(savedAppSettings.pingBodyWrapsLines, isBoolean, DEFAULT_APP_SETTINGS_V2.pingBodyWrapsLines),
    checkForUpdates: savedOr(savedAppSettings.checkForUpdates, isBoolean, DEFAULT_APP_SETTINGS_V2.checkForUpdates),
    skippedUpdateVersion: savedOr(savedAppSettings.skippedUpdateVersion, isNonEmptyString, DEFAULT_APP_SETTINGS_V2.skippedUpdateVersion),
    lastUpdateCheckMs: savedOr(savedAppSettings.lastUpdateCheckMs, isPositiveNumber, DEFAULT_APP_SETTINGS_V2.lastUpdateCheckMs),
    openSections: Object.fromEntries(FOLDING_SECTION_IDS.map((sectionId) => [sectionId, savedOr(savedOpenSections[sectionId], isBoolean, DEFAULT_APP_SETTINGS_V2.openSections[sectionId])])) as Record<FoldingSectionId, boolean>,
    failNextProjectLoad: savedOr(savedAppSettings.failNextProjectLoad, isBoolean, DEFAULT_APP_SETTINGS_V2.failNextProjectLoad),
  };
}

/** The saved object's fields; none when it isn't an object. */
function asObject(savedValue: unknown): Record<string, unknown> {
  return typeof savedValue === 'object' && savedValue !== null && !Array.isArray(savedValue) ? (savedValue as Record<string, unknown>) : {};
}

const isBoolean = (candidate: unknown): candidate is boolean => typeof candidate === 'boolean';
const isNonEmptyString = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '';
const isPositiveNumber = (candidate: unknown): candidate is number => typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0;
const isTextSize = (candidate: unknown): candidate is number =>
  Number.isInteger(candidate) && (candidate as number) >= TEXT_SIZES[0] && (candidate as number) <= TEXT_SIZES[TEXT_SIZES.length - 1];
