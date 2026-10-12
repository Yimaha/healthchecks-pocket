// The app's two kinds of saved data, kept apart on purpose:
//
//   settings  Generic preferences (theme, time zone, project names and
//             servers, view options). Android backs them up and carries them
//             to a new phone (Preferences: shared_prefs/CapacitorStorage.xml,
//             the only file the backup rules include). No secrets, except
//             API keys the user chose to carry over (below).
//   secrets   API keys. Encrypted with a key that never leaves this device
//             (Android Keystore) and excluded from backup and transfer, so
//             they're never carried over. The one exception is the user's
//             choice: with "Keep API keys on this device only" turned off
//             (it's on by default), keys are kept unencrypted as the
//             `carriedKeys` setting so they move to a new phone.
//
// Every key is listed here, so it's clear what goes where.

import { platform } from '../platform'

export type SettingKey =
  | 'projects' // [{ id, name, baseUrl, readOnly }], no API keys
  | 'active' // id of the open project
  | 'timezone'
  | `section.${string}` // a folded section
  | 'pingBody.size'
  | 'pingBody.wrap'
  | 'pingBody.mono'
  | 'pingBody.colours'
  | 'keys.deviceOnly' // '0': the user chose to carry API keys over
  | 'carriedKeys' // { [projectId]: apiKey }, only when keys.deviceOnly is '0'

export type SecretKey = `apiKey.${string}` // by project id

const PREFIX = 'healthchecks-pocket.'

export const settings = {
  get: (key: SettingKey) => platform.load(PREFIX + key),
  set: (key: SettingKey, value: string) => platform.save(PREFIX + key, value),
  remove: (key: SettingKey) => platform.remove(PREFIX + key),
}

export const secrets = {
  /** null when missing, or when it can't be decrypted (e.g. restored from
   *  another device's backup by some other tool). */
  async get(key: SecretKey): Promise<string | null> {
    try {
      return await platform.loadSecret(PREFIX + key)
    } catch {
      return null
    }
  },
  set: (key: SecretKey, value: string) => platform.saveSecret(PREFIX + key, value),
  remove: (key: SecretKey) => platform.removeSecret(PREFIX + key),
}
