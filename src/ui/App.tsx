import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { hasKey, loadAccounts, saveAccounts, setKeysDeviceOnly } from '../core/accounts'
import { createApi } from '../core/api'
import { APP_NAME } from '../core/app'
import { resolveTimeZone, SYSTEM_TZ } from '../core/timezones'
import type { Account } from '../core/types'
import { settings } from '../core/storage'
import { platform } from '../platform'
import { LoadingAurora } from './Aurora'
import { CheckDetail } from './CheckDetail'
import { CheckList } from './CheckList'
import { Header } from './common'
import { LoadingContext, useReportLoading } from './loading'
import { href, navigate as go, useRoute } from './routes'
import { Onboarding } from './Onboarding'
import { PingBody } from './PingBody'
import { RiskyActions } from './RiskyActions'
import { AddProject, NeedsKey, NoProjects, ProjectEdit, ProjectForm, Settings } from './Settings'
import { ThemeContext, useThemeState } from './theme'
import { TimeZoneContext } from './timezone'
import { UpdateContext, useUpdateState } from './updates'

export function App() {
  // Resetting the app remounts everything, so every screen and setting
  // starts from the (now empty) storage, as on a first launch.
  const [session, setSession] = useState(0)
  return <Session key={session} onReset={() => setSession((n) => n + 1)} />
}

function Session({ onReset }: { onReset: () => void }) {
  const [loads, setLoads] = useState(0)
  const [lastStart, setLastStart] = useState(0)
  const [lastEnd, setLastEnd] = useState(0)
  const reportLoading = useCallback((delta: 1 | -1) => {
    setLoads((n) => n + delta)
    if (delta > 0) setLastStart(performance.now())
    else setLastEnd(performance.now())
  }, [])
  const [tzChoice, setTzChoice] = useState(SYSTEM_TZ)
  useEffect(() => {
    void settings.get('timezone').then((v) => { if (v) setTzChoice(v) })
  }, [])
  const timeZone = useMemo(() => ({
    choice: tzChoice,
    tz: resolveTimeZone(tzChoice),
    setChoice: (c: string) => {
      setTzChoice(c)
      void settings.set('timezone', c).catch(() => {})
    },
  }), [tzChoice])

  const theme = useThemeState()
  const updates = useUpdateState()

  return (
    <ThemeContext.Provider value={theme}>
      <UpdateContext.Provider value={updates}>
        <TimeZoneContext.Provider value={timeZone}>
          <LoadingContext.Provider value={reportLoading}>
            <LoadingAurora mode={theme.lights} busy={loads > 0} lastStart={lastStart} lastEnd={lastEnd} />
            <Screens onReset={onReset} />
          </LoadingContext.Provider>
        </TimeZoneContext.Provider>
      </UpdateContext.Provider>
    </ThemeContext.Provider>
  )
}

function Screens({ onReset }: { onReset: () => void }): ReactNode {
  const [accounts, setAccounts] = useState<Account[]>()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [onboarded, setOnboarded] = useState(true)
  // Never had a project (first launch): the add-project form. Had some and
  // removed them all: the empty list, pointing to Settings.
  const [fresh, setFresh] = useState(true)
  const route = useRoute()

  useEffect(() => {
    void Promise.all([loadAccounts(), settings.get('onboarded'), settings.get('projects')]).then(([{ accounts, activeId }, done, saved]) => {
      setFresh(saved === null)
      // Installs from before onboarding existed already have projects: they
      // skip it. A restored phone has the flag from the backup.
      if (!done && accounts.length) void settings.set('onboarded', '1').catch(() => {})
      setOnboarded(!!done || accounts.length > 0)
      setAccounts(accounts)
      setActiveId(activeId)
    })
  }, [])

  function update(next: Account[], nextActive: string | null) {
    setFresh(false)
    setAccounts(next)
    setActiveId(nextActive)
    void saveAccounts(next, nextActive)
  }

  const account = accounts?.find((a) => a.id === activeId)
  const api = useMemo(() => (account && hasKey(account) ? createApi(account) : null), [account])

  if (!accounts) {
    // Reading saved projects; on Android the first read after install also
    // sets up the Keystore key, which can take a moment.
    return <Startup />
  }

  const add = (a: Account) => {
    update([...accounts, a], a.id)
    go({ name: 'list' })
  }

  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />

  // The checks screens need a project (and its key).
  const noProject = () => fresh ? <FirstProject onAdd={add} /> : <NoProjects />

  switch (route.name) {
    case 'check':
      if (!account) return noProject()
      return api ? <CheckDetail key={route.id} api={api} account={account} id={route.id} /> : <NeedsKey account={account} />
    case 'ping':
      if (!account) return noProject()
      return api ? <PingBody api={api} id={route.id} n={route.n} /> : <NeedsKey account={account} />
    case 'settings':
      return (
        <Settings
          accounts={accounts}
          activeId={activeId}
          onSelect={(id) => {
            update(accounts, id)
            go({ name: 'list' })
          }}
          onKeysDeviceOnly={(deviceOnly) => void setKeysDeviceOnly(deviceOnly, accounts, activeId)}
        />
      )
    case 'addProject':
      return <AddProject onAdd={add} />
    case 'risky':
      return (
        <RiskyActions
          accounts={accounts}
          onRemoveProjects={async () => {
            update([], null)
            go({ name: 'list' })
          }}
          onReset={async () => {
            await platform.clearAll()
            go({ name: 'list' })
            onReset()
          }}
        />
      )
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
      if (!account) return noProject()
      if (!api) return <NeedsKey account={account} />
      return <CheckList api={api} account={account} accounts={accounts} onSwitch={(id) => update(accounts, id)} />
  }
}

/** While saved projects load (on Android the first read after install also
 *  sets up the Keystore key, which can take a moment). Counts as loading,
 *  so the northern lights play. */
function Startup() {
  useReportLoading(true)
  return (
    <main className="page startup" aria-busy="true">
      <img className="hero-icon" src="./icon-192.png" alt="" />
      <p role="status">Getting {APP_NAME} ready…</p>
    </main>
  )
}

/** First launch, after onboarding: add the first project. Still part of
 *  setting up, so the northern lights keep playing. */
function FirstProject({ onAdd }: { onAdd: (a: Account) => void }) {
  useReportLoading(true)
  return (
    <>
      <Header title={APP_NAME} />
      <main className="page">
        <ProjectForm onSave={onAdd} first />
      </main>
    </>
  )
}
