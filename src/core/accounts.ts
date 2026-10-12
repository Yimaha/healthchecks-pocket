// Saved projects (one API key each), persisted through the platform adapter.
// They hold API keys, so they go to the platform's secret storage.

import { platform } from '../platform'
import type { Account } from './types'

const KEY = 'healthchecks-pocket.accounts'
const ACTIVE_KEY = 'healthchecks-pocket.active'

export const DEFAULT_BASE_URL = 'https://healthchecks.io'

export async function loadAccounts(): Promise<{ accounts: Account[]; activeId: string | null }> {
  let raw = await platform.loadSecret(KEY)
  if (raw === null) raw = await migrateFromPlainStorage()

  let accounts: Account[] = []
  try {
    accounts = JSON.parse(raw ?? '[]')
  } catch {
    accounts = []
  }
  const activeId = await platform.load(ACTIVE_KEY)
  return { accounts, activeId: accounts.some((a) => a.id === activeId) ? activeId : accounts[0]?.id ?? null }
}

export async function saveAccounts(accounts: Account[], activeId: string | null): Promise<void> {
  await platform.saveSecret(KEY, JSON.stringify(accounts))
  if (activeId) await platform.save(ACTIVE_KEY, activeId)
  else await platform.remove(ACTIVE_KEY)
}

/** Builds before 0.2.0 kept projects in plain storage. Move them into secret
 *  storage and delete the plain copy. (On the web both are localStorage, so
 *  this finds nothing.) */
async function migrateFromPlainStorage(): Promise<string | null> {
  const plain = await platform.load(KEY)
  if (plain === null) return null
  await platform.saveSecret(KEY, plain)
  await platform.remove(KEY)
  return plain
}

export function newAccountId(): string {
  return Math.random().toString(36).slice(2, 10)
}
