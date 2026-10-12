import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadAccounts, saveAccounts } from '../core/accounts'
import { createApi } from '../core/api'
import { APP_NAME } from '../core/app'
import { resolveTimeZone, SYSTEM_TZ } from '../core/timezones'
import type { Account } from '../core/types'
import { platform } from '../platform'
import { CheckDetail } from './CheckDetail'
import { CheckList } from './CheckList'
import { Header } from './common'
import { href, navigate as go, useRoute } from './routes'
import { PingBody } from './PingBody'
import { AddProject, ProjectEdit, ProjectForm, Settings } from './Settings'
import { TimeZoneContext } from './timezone'

const TZ_KEY = 'healthchecks-pocket.timezone'

export function App() {
  const [tzChoice, setTzChoice] = useState(SYSTEM_TZ)
  useEffect(() => {
    void platform.load(TZ_KEY).then((v) => { if (v) setTzChoice(v) })
  }, [])
  const timeZone = useMemo(() => ({
    choice: tzChoice,
    tz: resolveTimeZone(tzChoice),
    setChoice: (c: string) => {
      setTzChoice(c)
      void platform.save(TZ_KEY, c).catch(() => {})
    },
  }), [tzChoice])

  return <TimeZoneContext.Provider value={timeZone}><Screens /></TimeZoneContext.Provider>
}

function Screens(): ReactNode {
  const [accounts, setAccounts] = useState<Account[]>()
  const [activeId, setActiveId] = useState<string | null>(null)
  const route = useRoute()

  useEffect(() => {
    loadAccounts().then(({ accounts, activeId }) => {
      setAccounts(accounts)
      setActiveId(activeId)
    })
  }, [])

  function update(next: Account[], nextActive: string | null) {
    setAccounts(next)
    setActiveId(nextActive)
    void saveAccounts(next, nextActive)
  }

  const account = accounts?.find((a) => a.id === activeId)
  const api = useMemo(() => (account ? createApi(account) : null), [account])

  if (!accounts) {
    // Reading saved projects; on Android the first read after install also
    // sets up the Keystore key, which can take a moment.
    return (
      <>
        <Header title={APP_NAME} />
        <main className="page"><p className="empty">Loading…</p></main>
      </>
    )
  }

  const add = (a: Account) => {
    update([...accounts, a], a.id)
    go({ name: 'list' })
  }

  if (!account || !api) {
    return (
      <>
        <Header title={APP_NAME} />
        <main className="page">
          <ProjectForm onSave={add} first />
        </main>
      </>
    )
  }

  switch (route.name) {
    case 'check':
      return <CheckDetail key={route.id} api={api} account={account} id={route.id} />
    case 'ping':
      return <PingBody api={api} id={route.id} n={route.n} />
    case 'settings':
      return (
        <Settings
          accounts={accounts}
          activeId={activeId}
          onSelect={(id) => {
            update(accounts, id)
            go({ name: 'list' })
          }}
        />
      )
    case 'addProject':
      return <AddProject onAdd={add} />
    case 'project': {
      const editing = accounts.find((a) => a.id === route.id)
      if (!editing) {
        return (
          <>
            <Header title="Edit project" back={href({ name: 'settings' })} />
            <main className="page"><p className="empty">That project no longer exists.</p></main>
          </>
        )
      }
      return (
        <ProjectEdit
          account={editing}
          onSave={(a) => {
            update(accounts.map((x) => (x.id === a.id ? a : x)), activeId)
            go({ name: 'settings' })
          }}
          onRemove={(id) => {
            const rest = accounts.filter((a) => a.id !== id)
            update(rest, activeId === id ? rest[0]?.id ?? null : activeId)
            go({ name: rest.length ? 'settings' : 'list' })
          }}
        />
      )
    }
    default:
      return <CheckList api={api} account={account} accounts={accounts} onSwitch={(id) => update(accounts, id)} />
  }
}
