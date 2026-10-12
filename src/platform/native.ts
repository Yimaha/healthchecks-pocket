import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Clipboard } from '@capacitor/clipboard'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Share } from '@capacitor/share'
import type { Platform } from '.'

// Android/iOS via Capacitor.
// - Secrets: SecureStorage encrypts each value with AES-GCM using a key that
//   lives in the Android Keystore (iOS: Keychain). The key can't be exported,
//   so a copied app-data file or backup is useless elsewhere; the secure
//   prefs are also excluded from Android backup and transfer.
// - Non-secrets: Preferences (SharedPreferences / UserDefaults), the only data
//   Android backs up (res/xml/data_extraction_rules.xml, backup_rules.xml).
//   See src/core/storage.ts for what goes where.
const securePrefix = SecureStorage.setKeyPrefix('healthchecks-pocket.')

let lastDark: boolean | undefined

/** Capacitor sets --safe-area-inset-top when the WebView is edge-to-edge. */
function drawsUnderBars(): boolean {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) > 0
}

export const nativePlatform: Platform = {
  async load(key) {
    return (await Preferences.get({ key })).value
  },
  async save(key, value) {
    await Preferences.set({ key, value })
  },
  async remove(key) {
    await Preferences.remove({ key })
  },
  async loadSecret(key) {
    await securePrefix
    const value = await SecureStorage.get(key, false) // false: don't turn ISO dates into Date
    return typeof value === 'string' ? value : null
  },
  async saveSecret(key, value) {
    await securePrefix
    await SecureStorage.set(key, value, false)
  },
  async removeSecret(key) {
    await securePrefix
    await SecureStorage.remove(key)
  },
  async clearAll() {
    await Preferences.clear() // only this app's group (CapacitorStorage)
    await securePrefix
    await SecureStorage.clear() // only keys with this app's prefix
  },
  openExternal(url) {
    void Browser.open({ url })
  },
  setDarkBars(dark) {
    lastDark = dark
    // With a WebView that draws under the status bar (Chromium 140+), the bar
    // shows the app's header, so its icons follow the app's theme. Older
    // WebViews are inset below the bar, which then shows the system's
    // background: keep the system's icon colour there.
    const style = drawsUnderBars() ? (dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light) : SystemBarsStyle.Default
    void SystemBars.setStyle({ style }).catch(() => {})
  },
  async copyText(text) {
    await Clipboard.write({ string: text })
  },
  async shareText(title, text) {
    try {
      await Share.share({ title, text, dialogTitle: title })
    } catch (e) {
      // Closing the share sheet without picking an app isn't an error.
      if (!/cancel/i.test(String((e as Error).message))) throw e
    }
  },
  updatesSupported: true,
  secretProtection: Capacitor.getPlatform() === 'ios' ? 'keychain' : 'keystore',
}

// Android back button: go back a screen, or leave the app from the list.
void App.addListener('backButton', () => {
  if (location.hash && location.hash !== '#/') history.back()
  else void App.exitApp()
})

// The insets can arrive after the first theme was applied (or change with
// rotation): set the bar style again.
window.addEventListener('resize', () => {
  if (lastDark !== undefined) nativePlatform.setDarkBars(lastDark)
})
