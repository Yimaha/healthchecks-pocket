// Saved projects. A project's name, server and key kind are generic settings
// (carried to a new phone); its API key is a device-only secret, unless the
// user turned "Keep API keys on this device only" off, which keeps keys as a
// plain setting that moves with the others. A project whose key isn't on
// this device (e.g. after moving phones) has apiKey ''.

import { platform } from '../platform'
import { secrets, settings } from './storage'
import type { Account } from './types'

export const DEFAULT_BASE_URL = 'https://healthchecks.io'

type Project = Omit<Account, 'apiKey'>

// Builds up to 0.3 kept whole projects, keys included, under this key: in
// secret storage (0.2, 0.3) or plain storage (older).
const LEGACY_KEY = 'healthchecks-pocket.accounts'

export async function loadAccounts(): Promise<{ accounts: Account[]; activeId: string | null }> {
  const raw = await settings.get('projects')
  const accounts = raw === null ? await migrateLegacy() : await withKeys(parse<Project>(raw))
  const activeId = await settings.get('active')
  return { accounts, activeId: accounts.some((a) => a.id === activeId) ? activeId : accounts[0]?.id ?? null }
}

export async function saveAccounts(accounts: Account[], activeId: string | null): Promise<void> {
  const before = parse<Project>((await settings.get('projects')) ?? '[]')
  await settings.set('projects', JSON.stringify(accounts.map(({ id, name, baseUrl, readOnly }) => ({ id, name, baseUrl, readOnly }))))
  if (await keysDeviceOnly()) {
    for (const a of accounts) {
      if (a.apiKey) await secrets.set(`apiKey.${a.id}`, a.apiKey)
    }
    await settings.remove('carriedKeys')
  } else {
    const carried = Object.fromEntries(accounts.filter(hasKey).map((a) => [a.id, a.apiKey]))
    await settings.set('carriedKeys', JSON.stringify(carried))
    for (const a of accounts) await secrets.remove(`apiKey.${a.id}`)
  }
  for (const p of before) {
    if (!accounts.some((a) => a.id === p.id)) await secrets.remove(`apiKey.${p.id}`)
  }
  if (activeId) await settings.set('active', activeId)
  else await settings.remove('active')
}

/** Whether API keys stay encrypted on this device (the default) rather
 *  than moving to a new phone with the settings. */
export async function keysDeviceOnly(): Promise<boolean> {
  return (await settings.get('keys.deviceOnly')) !== '0'
}

/** Switch where API keys are kept, moving the saved ones. */
export async function setKeysDeviceOnly(deviceOnly: boolean, accounts: Account[], activeId: string | null): Promise<void> {
  await settings.set('keys.deviceOnly', deviceOnly ? '1' : '0')
  await saveAccounts(accounts, activeId)
}

export function hasKey(a: Account): boolean {
  return a.apiKey !== ''
}

function parse<T>(raw: string): T[] {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

async function withKeys(projects: Project[]): Promise<Account[]> {
  let carried: Record<string, string> = {}
  try {
    carried = JSON.parse((await settings.get('carriedKeys')) ?? '{}') ?? {}
  } catch {
    carried = {}
  }
  return Promise.all(projects.map(async (p) => ({
    ...p,
    apiKey: (await secrets.get(`apiKey.${p.id}`)) ?? (typeof carried[p.id] === 'string' ? carried[p.id] : ''),
  })))
}

/** Split projects saved by builds up to 0.3 into settings and secrets, and
 *  delete the old copy. */
async function migrateLegacy(): Promise<Account[]> {
  let raw: string | null = null
  try {
    raw = await platform.loadSecret(LEGACY_KEY)
  } catch {
    raw = null
  }
  raw ??= await platform.load(LEGACY_KEY)
  if (raw === null) return []
  const accounts = parse<Account>(raw).map((a) => ({ ...a, apiKey: a.apiKey ?? '' }))
  await saveAccounts(accounts, await settings.get('active'))
  await platform.removeSecret(LEGACY_KEY)
  await platform.remove(LEGACY_KEY)
  return accounts
}

export function newAccountId(): string {
  return Math.random().toString(36).slice(2, 10)
}
