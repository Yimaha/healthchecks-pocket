import { useState, type FormEvent } from 'react'
import { DEFAULT_BASE_URL, newAccountId } from '../core/accounts'
import { createApi, looksReadOnly, webLinks } from '../core/api'
import { DEMO_KEY } from '../core/demo'
import type { Account } from '../core/types'
import { platform } from '../platform'
import { ErrorBanner, ExternalLink, Header } from './common'
import { CheckMarkIcon, EditIcon, LockIcon, PlusIcon, UnlockIcon } from './icons'
import { href } from './routes'

function keyKind(a: Account): string {
  return a.apiKey === DEMO_KEY ? 'demo' : a.readOnly ? 'read-only key' : 'regular key'
}

/** Tells the user how the key they're about to enter is stored. */
function KeyStorageNotice() {
  const p = platform.secretProtection
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
  const store = p === 'keychain' ? 'iOS Keychain' : 'Android Keystore'
  return (
    <div className="notice">
      <LockIcon />
      <p>
        <strong>Your API key is encrypted on this device</strong> with a key held in the {store} (Capacitor Secure
        Storage plugin). That key never leaves this phone, so the API key isn't backed up or synced: on a new phone or
        after reinstalling the app, you'll need to add this project again.
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
      {!initial && <KeyStorageNotice />}
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

export function Settings({ accounts, activeId, onSelect }: {
  accounts: Account[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const baseUrl = accounts.find((a) => a.id === activeId)?.baseUrl ?? DEFAULT_BASE_URL
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
                  <span className="check-meta">{new URL(a.baseUrl).host} · {keyKind(a)} · …{a.apiKey.slice(-4)}</span>
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

        <h2 className="section-title">On healthchecks.io</h2>
        <div className="card card-links">
          <ExternalLink url={webLinks.dashboard(baseUrl)}>Dashboard, projects &amp; integrations</ExternalLink>
          <ExternalLink url={webLinks.account(baseUrl)}>Account settings</ExternalLink>
          <ExternalLink url={webLinks.apiKeysHelp}>About API keys</ExternalLink>
        </div>

        <p className="footnote">
          API keys are stored only on this device ({platform.secretProtection === 'none' ? 'browser storage, not encrypted' : 'encrypted'}) and sent only to the server you entered. Unofficial client, not
          affiliated with Healthchecks.io.
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
        <p className="footnote">Key type: {keyKind(account)}. Changing the key or server re-checks it before saving.</p>
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
