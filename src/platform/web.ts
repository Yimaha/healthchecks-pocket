import type { Platform } from '.'

// Browser storage can throw (private mode, blocked site data); treat that as
// "nothing saved" rather than crashing.
async function load(key: string): Promise<string | null> {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function save(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value)
}

async function remove(key: string): Promise<void> {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to remove */
  }
}

export const webPlatform: Platform = {
  load,
  save,
  remove,
  // Browsers have no hardware-backed store a page could use: anything that
  // can decrypt a value here could read it anyway. Secrets stay in
  // localStorage, readable by this origin only.
  loadSecret: load,
  saveSecret: save,
  removeSecret: remove,
  async clearAll() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('healthchecks-pocket.')) localStorage.removeItem(key)
    }
  },
  openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  setDarkBars() {
    // The browser draws its own bars (theme-color is set with the theme).
  },
  async copyText(text) {
    await navigator.clipboard.writeText(text)
  },
  // Desktop browsers mostly lack the Web Share API; the app is tested here,
  // not shipped, so Copy is enough.
  shareText: null,
  updatesSupported: false,
  secretProtection: 'none',
}
