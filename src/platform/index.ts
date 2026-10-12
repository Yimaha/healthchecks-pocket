// The only platform-specific code in the app. Each target supplies these
// capabilities; everything else is shared.
//
//   web (PWA):       ./web.ts     localStorage, window.open, Clipboard API
//   Android / iOS:   ./native.ts  Capacitor Preferences + Keystore/Keychain
//                                 secure storage + Browser, Clipboard, Share,
//                                 SystemBars
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
  /** Delete everything the app saved on this device: settings and secrets. */
  clearAll(): Promise<void>
  /** Open a URL in the system browser (healthchecks.io settings pages). */
  openExternal(url: string): void
  /** Put text on the clipboard. */
  copyText(text: string): Promise<void>
  /** Match the system status bar's icons to the app's theme (light icons on
   *  a dark theme). */
  setDarkBars(dark: boolean): void
  /** Hand text to the system share sheet; null where there is none. */
  shareText: ((title: string, text: string) => Promise<void>) | null
  /** Whether the app checks GitHub for new versions here (an installed APK
   *  can be updated; the web version is for development). */
  updatesSupported: boolean
  /** How secrets are protected here, for telling the user: 'keystore'
   *  (Android), 'keychain' (iOS), or 'none' (plain browser storage). */
  secretProtection: 'keystore' | 'keychain' | 'none'
}

export const platform: Platform = Capacitor.isNativePlatform() ? nativePlatform : webPlatform
