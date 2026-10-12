import { useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_BASE_URL, hasKey, keysDeviceOnly, newAccountId } from '../core/accounts'
import { createApi, looksReadOnly, webLinks } from '../core/api'
import { APP_NAME, APP_VERSION } from '../core/app'
import { DEMO_KEY } from '../core/demo'
import type { Account } from '../core/types'
import { platform } from '../platform'
import { ErrorBanner, ExternalLink, Header } from './common'
import { CheckMarkIcon, ChevronIcon, EditIcon, LockIcon, PlusIcon, SettingsIcon, UnlockIcon } from './icons'
import { href } from './routes'
import { ThemePicker } from './ThemePicker'
import { UpdateSettings } from './UpdatePrompt'

function keyKind(a: Account): string {
  return a.apiKey === DEMO_KEY ? 'demo' : a.readOnly ? 'read-only key' : 'regular key'
}

function keySummary(a: Account): string {
  return hasKey(a) ? `${keyKind(a)} · …${a.apiKey.slice(-4)}` : 'API key needed'
}

/** Tells the user how the project's key is (or will be) stored, following
 *  the current "Keep API keys on this device only" setting. `saved`: the
 *  key is already stored (editing a project). */
function KeyStorageNotice({ saved }: { saved?: boolean }) {
  const p = platform.secretProtection
  // Unknown until the saved choice is read: show nothing rather than a
  // notice that may be wrong (an "encrypted" one when the user turned it off).
  const [deviceOnly, setDeviceOnly] = useState<boolean>()
  useEffect(() => { void keysDeviceOnly().then(setDeviceOnly) }, [])
  if (p === 'none') {
    return (
      <div className="notice notice-warn">
        <UnlockIcon />
        <p>
          <strong>Not encrypted in the browser.</strong> The web version keeps your API key in this browser's local
          storage. For encrypted storage, use the Android app.
        </p>
      </div>
    )
  }
  if (deviceOnly === undefined) return null
  if (!deviceOnly) {
    return (
      <div className="notice notice-warn">
        <UnlockIcon />
        <p>
          <strong>Your API key {saved ? 'is' : 'will be'} saved unencrypted</strong> with your settings, so it moves to a new phone with
          Android backup and transfer. You chose this in Settings (API keys).
        </p>
      </div>
    )
  }
  const store = p === 'keychain' ? 'iOS Keychain' : 'Android Keystore'
  return (
    <div className="notice">
      <LockIcon />
      <p>
        <strong>Your API key is encrypted on this device</strong> with a key held in the {store} (Capacitor Secure
        Storage plugin). That key never leaves this phone, so the API key isn't backed up or moved to a new phone. The
        project's name and server are: on a new phone, you only paste the key again.
      </p>
    </div>
  )
}

/** Add a project, or edit one (`initial`). A new or changed key/server is
 *  checked against the API before saving. */
export function ProjectForm({ initial, onSave, first }: {
  initial?: Account
  onSave: (a: Account) => void
  first?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? DEFAULT_BASE_URL)
  const [advanced, setAdvanced] = useState(!!initial && initial.baseUrl !== DEFAULT_BASE_URL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    const key = apiKey.trim()
    const url = baseUrl.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL
    try {
      let readOnly = initial?.readOnly ?? false
      if (!initial || key !== initial.apiKey || url !== initial.baseUrl) {
        readOnly = looksReadOnly(await createApi({ baseUrl: url, apiKey: key }).listChecks())
      }
      onSave({
        id: initial?.id ?? newAccountId(),
        name: name.trim() || (key === DEMO_KEY ? 'Demo project' : new URL(url).host),
        baseUrl: url,
        apiKey: key,
        readOnly,
      })
      if (!initial) {
        setName('')
        setApiKey('')
      }
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      {initial && !hasKey(initial) && (
        <p className="desc">
          This project's API key isn't on this device (API keys aren't carried over to a new phone). Paste it again to
          use the project.
        </p>
      )}
      {first && (
        <p className="desc">
          Paste a project API key from healthchecks.io (Project Settings → API Access). A regular key shows ping logs
          and can pause checks; a read-only key only shows statuses.
        </p>
      )}
      <label>
        <span>Project name <span className="hint">(optional)</span></span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Home lab" autoComplete="off" />
      </label>
      <label>
        <span>API key</span>
        <span className="input-with-action">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste API key"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
          />
          <button type="button" className="link-button" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>
      {advanced ? (
        <label>
          <span>Server <span className="hint">(self-hosted Healthchecks)</span></span>
          <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </label>
      ) : (
        <button type="button" className="link-button" onClick={() => setAdvanced(true)}>Using a self-hosted server?</button>
      )}
      <KeyStorageNotice saved={!!initial && hasKey(initial)} />
      {error && <ErrorBanner error={error} />}
      <button className="button" type="submit" disabled={busy || !apiKey.trim()}>
        {busy ? 'Checking key…' : initial ? 'Save changes' : 'Add project'}
      </button>
      {first && (
        <button type="button" className="link-button" onClick={() => setApiKey(DEMO_KEY)}>
          No key yet? Try the demo
        </button>
      )}
    </form>
  )
}

/** "Keep API keys on this device only": on by default. Off keeps keys
 *  unencrypted with the settings, so they move to a new phone. */
export function KeyProtection({ deviceOnly, onChange }: { deviceOnly: boolean; onChange: (v: boolean) => void }) {
  const change = (v: boolean) => {
    if (!v && !confirm(
      'Save API keys unencrypted with your settings? Android backup and phone-to-phone transfer will then carry them to a new phone, and anyone who can read your backup or this app\'s data could read them.',
    )) return
    onChange(v)
  }
  return (
    <>
      <h2 className="section-title">API keys</h2>
      <div className="card">
        <label className="toggle-row">
          <input type="checkbox" checked={deviceOnly} onChange={(e) => change(e.target.checked)} />
          <span>Keep API keys on this device only <span className="hint">(recommended)</span></span>
        </label>
        <p className="hint-text">
          {deviceOnly
            ? 'Encrypted with a key that never leaves this phone. On a new phone, your projects come along and you paste their keys again.'
            : 'Saved unencrypted with your settings, so they move to a new phone with Android backup and transfer.'}
        </p>
      </div>
    </>
  )
}

export function Settings({ accounts, activeId, onSelect, onKeysDeviceOnly }: {
  accounts: Account[]
  activeId: string | null
  onSelect: (id: string) => void
  onKeysDeviceOnly: (deviceOnly: boolean) => void
}) {
  const baseUrl = accounts.find((a) => a.id === activeId)?.baseUrl ?? DEFAULT_BASE_URL
  const [deviceOnly, setDeviceOnly] = useState(true)
  useEffect(() => { void keysDeviceOnly().then(setDeviceOnly) }, [])
  const encrypted = platform.secretProtection !== 'none'
  return (
    <>
      <Header title="Settings" back={href({ name: 'list' })} />
      <main className="page">
        <h2 className="section-title">Projects</h2>
        <ul className="list">
          {accounts.map((a) => (
            <li key={a.id} className="project-row">
              <button className="project-select-row" onClick={() => onSelect(a.id)}>
                <span className="project-active">{a.id === activeId && <CheckMarkIcon />}</span>
                <span className="check-main">
                  <span className="check-name">{a.name}</span>
                  <span className="check-meta">{new URL(a.baseUrl).host} · {keySummary(a)}</span>
                </span>
              </button>
              <a className="edit-button" href={href({ name: 'project', id: a.id })} aria-label={`Edit ${a.name}`}>
                <EditIcon /> Edit
              </a>
            </li>
          ))}
          <li>
            <a className="add-project-row" href={href({ name: 'addProject' })}>
              <PlusIcon /> Add project
            </a>
          </li>
        </ul>

        <h2 className="section-title">Appearance</h2>
        <ThemePicker />

        {encrypted && (
          <KeyProtection deviceOnly={deviceOnly} onChange={(v) => { setDeviceOnly(v); onKeysDeviceOnly(v) }} />
        )}

        <UpdateSettings />

        <h2 className="section-title">On healthchecks.io</h2>
        <div className="card card-links">
          <ExternalLink url={webLinks.dashboard(baseUrl)}>Dashboard, projects &amp; integrations</ExternalLink>
          <ExternalLink url={webLinks.account(baseUrl)}>Account settings</ExternalLink>
          <ExternalLink url={webLinks.apiKeysHelp}>About API keys</ExternalLink>
        </div>

        <a className="row-link risky-link" href={href({ name: 'risky' })}>
          <span className="row-link-label">Risky actions</span>
          <ChevronIcon />
        </a>

        <p className="footnote">
          API keys are {!encrypted ? 'stored only on this device (browser storage, not encrypted)' : deviceOnly ? 'stored only on this device (encrypted)' : 'saved with your settings (not encrypted)'} and
          sent only to the server you entered. Version {APP_VERSION}. Unofficial client, not affiliated with
          Healthchecks.io.
        </p>
      </main>
    </>
  )
}

export function ProjectEdit({ account, onSave, onRemove }: {
  account: Account
  onSave: (a: Account) => void
  onRemove: (id: string) => void
}) {
  return (
    <>
      <Header title="Edit project" back={href({ name: 'settings' })} />
      <main className="page">
        <ProjectForm key={account.id} initial={account} onSave={onSave} />
        {hasKey(account) && (
          <p className="footnote">Key type: {keyKind(account)}. Changing the key or server re-checks it before saving.</p>
        )}
        <button
          className="button button-danger"
          onClick={() => confirm(`Remove "${account.name}" from this device?`) && onRemove(account.id)}
        >
          Remove project
        </button>
      </main>
    </>
  )
}

export function AddProject({ onAdd }: { onAdd: (a: Account) => void }) {
  return (
    <>
      <Header title="Add project" back={href({ name: 'settings' })} />
      <main className="page">
        <ProjectForm onSave={onAdd} first />
      </main>
    </>
  )
}

/** The open project has no API key on this device (e.g. after moving to a
 *  new phone: projects come along, keys don't). */
export function NeedsKey({ account }: { account: Account }) {
  return (
    <>
      <Header
        title={APP_NAME}
        right={<a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>}
      />
      <main className="page">
        <section className="card">
          <h2 className="card-title">Add the API key for {account.name}</h2>
          <p className="desc">
            API keys stay on the phone they were added on, so this project's key needs pasting again here. Other
            projects are in Settings.
          </p>
          <a className="button" href={href({ name: 'project', id: account.id })}>Add API key</a>
        </section>
      </main>
    </>
  )
}

/** No projects on this device any more (all removed): the empty list, with a
 *  big hint pointing at Settings, where projects are added. */
export function NoProjects() {
  return (
    <>
      <Header
        title={APP_NAME}
        right={<a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>}
      />
      <main className="page no-projects">
        <svg className="no-projects-arrow" viewBox="0 0 200 120" preserveAspectRatio="xMaxYMin meet" aria-hidden="true">
          <path d="M14 112 C 120 112, 172 76, 182 14" />
          <path d="M168 30 L 182 12 L 194 32" />
        </svg>
        <p className="no-projects-title">Set up a project in Settings</p>
        <p className="no-projects-text">
          Tap <SettingsIcon /> up here, then <strong>Add project</strong>, to see your checks. No account yet? Try the demo
          there.
        </p>
      </main>
    </>
  )
}
