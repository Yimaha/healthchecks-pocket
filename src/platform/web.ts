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
  openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  secretProtection: 'none',
}
