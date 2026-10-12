// The only platform-specific code in the app. Each target supplies these
// capabilities; everything else is shared.
//
//   web (PWA):       ./web.ts     localStorage, window.open
//   Android / iOS:   ./native.ts  Capacitor Preferences + Keystore/Keychain
//                                 secure storage + Browser
//   Windows / macOS: (later) a Tauri adapter with the same interface
//
// To add a target, write an adapter with this interface and select it below.

import { Capacitor } from '@capacitor/core'
import { nativePlatform } from './native'
import { webPlatform } from './web'

export interface Platform {
  /** Persist a small non-secret value (UI preferences). */
  load(key: string): Promise<string | null>
  save(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  /** Persist a secret (saved projects, including API keys). Native targets
   *  encrypt it with a hardware-backed key; the web has no equivalent. */
  loadSecret(key: string): Promise<string | null>
  saveSecret(key: string, value: string): Promise<void>
  removeSecret(key: string): Promise<void>
  /** Open a URL in the system browser (healthchecks.io settings pages). */
  openExternal(url: string): void
  /** How secrets are protected here, for telling the user: 'keystore'
   *  (Android), 'keychain' (iOS), or 'none' (plain browser storage). */
  secretProtection: 'keystore' | 'keychain' | 'none'
}

export const platform: Platform = Capacitor.isNativePlatform() ? nativePlatform : webPlatform
