import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../../src/core/types'

// A platform with separate plain and secret stores, like Android
// (Preferences vs Keystore-encrypted SecureStorage).
const plain = new Map<string, string>()
const secret = new Map<string, string>()
vi.mock('../../src/platform', () => ({
  platform: {
    load: async (k: string) => plain.get(k) ?? null,
    save: async (k: string, v: string) => void plain.set(k, v),
    remove: async (k: string) => void plain.delete(k),
    loadSecret: async (k: string) => secret.get(k) ?? null,
    saveSecret: async (k: string, v: string) => void secret.set(k, v),
    removeSecret: async (k: string) => void secret.delete(k),
    openExternal: () => {},
    secretProtection: 'keystore',
  },
}))

const { loadAccounts, newAccountId, saveAccounts } = await import('../../src/core/accounts')

const ACCOUNTS = 'healthchecks-pocket.accounts'
const ACTIVE = 'healthchecks-pocket.active'
const a1: Account = { id: 'a1', name: 'Home', baseUrl: 'https://healthchecks.io', apiKey: 'key-one', readOnly: false }
const a2: Account = { id: 'a2', name: 'Work', baseUrl: 'https://hc.example.org', apiKey: 'key-two', readOnly: true }

beforeEach(() => {
  plain.clear()
  secret.clear()
})

describe('saved projects', () => {
  it('stores projects (with API keys) only in secret storage', async () => {
    await saveAccounts([a1, a2], 'a2')
    expect(JSON.parse(secret.get(ACCOUNTS)!)).toEqual([a1, a2])
    expect(plain.has(ACCOUNTS)).toBe(false)
    expect([...plain.values()].join()).not.toContain('key-')
    expect(plain.get(ACTIVE)).toBe('a2') // which project is open isn't secret
  })

  it('loads what was saved', async () => {
    await saveAccounts([a1, a2], 'a2')
    expect(await loadAccounts()).toEqual({ accounts: [a1, a2], activeId: 'a2' })
  })

  it('falls back to the first project when the saved active one is gone', async () => {
    await saveAccounts([a1], 'a1')
    plain.set(ACTIVE, 'deleted')
    expect((await loadAccounts()).activeId).toBe('a1')
  })

  it('starts empty, and survives corrupt data', async () => {
    expect(await loadAccounts()).toEqual({ accounts: [], activeId: null })
    secret.set(ACCOUNTS, '{not json')
    expect((await loadAccounts()).accounts).toEqual([])
  })

  it('clears the active project when none is left', async () => {
    await saveAccounts([a1], 'a1')
    await saveAccounts([], null)
    expect(plain.has(ACTIVE)).toBe(false)
  })
})

describe('migration from older builds', () => {
  it('moves projects from plain storage into secret storage and deletes the plain copy', async () => {
    plain.set(ACCOUNTS, JSON.stringify([a1]))
    plain.set(ACTIVE, 'a1')
    expect(await loadAccounts()).toEqual({ accounts: [a1], activeId: 'a1' })
    expect(JSON.parse(secret.get(ACCOUNTS)!)).toEqual([a1])
    expect(plain.has(ACCOUNTS)).toBe(false)
  })

  it('prefers secret storage when both exist', async () => {
    secret.set(ACCOUNTS, JSON.stringify([a2]))
    plain.set(ACCOUNTS, JSON.stringify([a1]))
    expect((await loadAccounts()).accounts).toEqual([a2])
  })
})

describe('newAccountId', () => {
  it('makes short unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, newAccountId))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{4,8}$/)
  })
})
