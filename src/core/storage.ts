// The app's two kinds of saved data, kept apart on purpose:
//
//   settings  Generic preferences (theme, time zone, project names, view
//             options, check icons). Android backs them up and carries them
//             to a new phone (Preferences: shared_prefs/CapacitorStorage.xml).
//             No secrets, except API keys the user chose to carry over
//             (below).
//   secrets   API keys. Encrypted with a key that never leaves this device
//             (Android Keystore) and excluded from backup and transfer, so
//             they're never carried over. The one exception is the user's
//             choice: with "Keep API keys on this device only" turned off
//             (it's on by default), keys are kept unencrypted as the
//             `carriedKeys` setting so they move to a new phone. Android
//             keeps that one in its own file (src/platform/native.ts), which
//             goes to Google only in a backup encrypted on the phone.
//
// Every key is listed here, so it's clear what goes where. They're the names
// phones have saved, so they stay when the code's own names change.

import { platform } from '../platform';

export type SettingKey =
  | 'onboarded' // '1' once the first-launch settings page was done
  | 'projects' // SavedProject[]: no API keys
  | 'active' // activeProjectId: the open project's id
  | 'timezone'
  | 'theme' // ThemeMode
  | 'lights' // the background (BackgroundMode), named when the northern lights were the only one
  | 'icons.assigned' // { "<projectId>/<checkId>": IconRef }
  | 'icons.uploads' // [uploadId, ...]: the images the user uploaded
  | `icons.upload.${string}` // one uploaded image: a 192x192 data URL
  | 'icons.custom' // 0.5.0 test builds: every upload in one { [id]: data URL }; moved to the keys above
  | `section.${string}` // a folded section
  | 'pingBody.size'
  | 'pingBody.wrap'
  | 'updates.enabled' // '0': don't check for new versions
  | 'updates.skipped' // the version the user chose to skip
  | 'updates.lastCheck' // ms since epoch
  | 'debug.failNextProjectLoad' // '1': the next load of the saved projects fails once (Risky actions > Debug)
  | 'keys.deviceOnly' // keepKeysOnDeviceOnly; '0': the user chose to carry API keys over
  | 'carriedKeys'; // { [projectId]: apiKey }, only when keepKeysOnDeviceOnly is off

export type SecretKey = `apiKey.${string}`; // by project id

const PREFIX = 'healthchecks-pocket.';

export const settings = {
  get: (key: SettingKey) => platform.load(PREFIX + key),
  set: (key: SettingKey, value: string) => platform.save(PREFIX + key, value),
  remove: (key: SettingKey) => platform.remove(PREFIX + key),
};

// Saves of projects and keys, and resets, run one at a time, so their steps can't interleave (e.g. a save deleting a key another one just wrote).
let lastQueuedWrite: Promise<unknown> = Promise.resolve();

export function queueStorageWrite<T>(write: () => Promise<T>): Promise<T> {
  const queuedWrite = lastQueuedWrite.then(write);
  lastQueuedWrite = queuedWrite.catch(() => {}); // the next write waits for this one, whether it worked or not
  return queuedWrite;
}

/** Delete everything the app saved on this device, after any save still running. */
export function clearAllSavedData(): Promise<void> {
  return queueStorageWrite(() => platform.clearAll());
}

/** Secure storage failed to read a secret (e.g. an Android Keystore error), often only for a moment: it's still saved. */
export class SecretReadFailed extends Error {}

export const secrets = {
  /** null when missing, or when the saved value is damaged for good (the
   *  secure storage plugin's `invalidData`). Throws SecretReadFailed when
   *  secure storage fails to read it, so that isn't mistaken for a missing key. */
  async get(key: SecretKey): Promise<string | null> {
    try {
      return await platform.loadSecret(PREFIX + key);
    } catch (readError) {
      if ((readError as { code?: unknown }).code === 'invalidData') return null;
      throw new SecretReadFailed(`Couldn't read the API key from secure storage: ${(readError as Error).message}`);
    }
  },
  set: (key: SecretKey, value: string) => platform.saveSecret(PREFIX + key, value),
  remove: (key: SecretKey) => platform.removeSecret(PREFIX + key),
};
