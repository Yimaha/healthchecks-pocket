import { useEffect, useState, type FormEvent } from 'react';
import { createApi, looksReadOnly, webLinks } from '../core/api';
import { APP_NAME, APP_VERSION } from '../core/app';
import { DEMO_KEY } from '../core/demo';
import { DEFAULT_PING_LOG_DAYS } from '../core/pingLogRange';
import { apiKeyFromPasted, DEFAULT_BASE_URL, hasApiKey, keysDeviceOnly, newProjectId, withoutInvisibleCharacters } from '../core/projects';
import type { Project } from '../core/types';
import { platform } from '../platform';
import { ErrorBanner, ExternalLink, Header } from './common';
import { CheckMarkIcon, ChevronIcon, EditIcon, LockIcon, PlusIcon, SettingsIcon, UnlockIcon } from './icons';
import { href } from './routes';
import { ThemePicker } from './ThemePicker';
import { UpdateSettings } from './UpdatePrompt';

function keyKind(project: Project): string {
  return project.apiKey === DEMO_KEY ? 'demo' : project.readOnly ? 'read-only key' : 'regular key';
}

function keySummary(project: Project): string {
  if (project.apiKeyUnreadable) return "API key couldn't be read";
  return hasApiKey(project) ? `${keyKind(project)} · …${project.apiKey.slice(-4)}` : 'API key needed';
}

/** "hc.example.org"; a damaged saved server that isn't a URL shows as saved, so Settings still opens to fix it. */
function serverHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return String(baseUrl);
  }
}

/** Tells the user how the project's key is (or will be) stored, following
 *  the current "Keep API keys on this device only" setting. `saved`: the
 *  key is already stored (editing a project). */
function KeyStorageNotice({ saved }: { saved?: boolean }) {
  const protection = platform.secretProtection;
  // Unknown until the saved choice is read: show nothing rather than a
  // notice that may be wrong (an "encrypted" one when the user turned it off).
  const [deviceOnly, setDeviceOnly] = useState<boolean>();
  useEffect(() => { void keysDeviceOnly().then(setDeviceOnly); }, []);
  if (protection === 'none') {
    return (
      <div className="notice notice-warn">
        <UnlockIcon />
        <p>
          <strong>Not encrypted in the browser.</strong> The web version keeps your API key in this browser's local
          storage. For encrypted storage, use the Android app.
        </p>
      </div>
    );
  }
  if (deviceOnly === undefined) return null;
  if (!deviceOnly) {
    return (
      <div className="notice notice-warn">
        <UnlockIcon />
        <p>
          <strong>Your API key {saved ? 'is' : 'will be'} saved unencrypted</strong> with your settings, so it moves to a new phone with
          Android backup and transfer. You chose this in Settings (API keys).
        </p>
      </div>
    );
  }
  const store = protection === 'keychain' ? 'iOS Keychain' : 'Android Keystore';
  return (
    <div className="notice">
      <LockIcon />
      <p>
        <strong>Your API key is encrypted on this device</strong> with a key held in the {store} (Capacitor Secure
        Storage plugin). That key never leaves this phone, so the API key isn't backed up or moved to a new phone. The
        project's name and server are: on a new phone, you only paste the key again.
      </p>
    </div>
  );
}

/** Add a project, or edit one (`initial`). A new or changed key/server is
 *  checked against the API before saving. */
export function ProjectForm({ initial, onSave, first }: {
  initial?: Project;
  onSave: (project: Project) => Promise<void>;
  first?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? DEFAULT_BASE_URL);
  const [advanced, setAdvanced] = useState(!!initial && initial.baseUrl !== DEFAULT_BASE_URL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const url = baseUrl.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
    try {
      const key = apiKeyFromPasted(apiKey);
      let readOnly = initial?.readOnly ?? false;
      if (!initial || key !== initial.apiKey || url !== initial.baseUrl) {
        readOnly = looksReadOnly(await createApi({ baseUrl: url, apiKey: key }).listChecks());
      }
      // Awaited: if saving fails, the form stays as typed and shows why.
      await onSave({
        id: initial?.id ?? newProjectId(),
        name: name.trim() || (key === DEMO_KEY ? 'Demo project' : new URL(url).host),
        baseUrl: url,
        apiKey: key,
        readOnly,
        pingLogDays: initial?.pingLogDays ?? DEFAULT_PING_LOG_DAYS, // kept as saved: the form has no control for it yet
      });
      if (!initial) {
        setName('');
        setApiKey('');
      }
    } catch (checkError) {
      setError(checkError as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      {initial?.apiKeyUnreadable && (
        <p className="desc">
          This project's API key is saved, but this phone's secure storage couldn't read it just now. Paste it again to
          use the project now, or go back and try again later.
        </p>
      )}
      {initial && !hasApiKey(initial) && !initial.apiKeyUnreadable && (
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
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Home lab" autoComplete="off" />
      </label>
      <label>
        <span>API key</span>
        <span className="input-with-action">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
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
          <input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
      ) : (
        <button type="button" className="link-button" onClick={() => setAdvanced(true)}>Using a self-hosted server?</button>
      )}
      <KeyStorageNotice saved={!!initial && hasApiKey(initial)} />
      {error && <ErrorBanner error={error} />}
      <button className="button" type="submit" disabled={busy || !withoutInvisibleCharacters(apiKey)}>
        {busy ? 'Checking key…' : initial ? 'Save changes' : 'Add project'}
      </button>
      {first && (
        <button type="button" className="link-button" onClick={() => setApiKey(DEMO_KEY)}>
          No key yet? Try the demo
        </button>
      )}
    </form>
  );
}

/** "Keep API keys on this device only": on by default. Off keeps keys
 *  unencrypted with the settings, so they move to a new phone. */
export function KeyProtection({ deviceOnly, onChange, saving, error }: {
  deviceOnly: boolean;
  onChange: (deviceOnly: boolean) => void;
  saving?: boolean;
  error?: Error;
}) {
  const change = (keepOnDevice: boolean) => {
    if (!keepOnDevice && !confirm(
      'Save API keys unencrypted with your settings? Android backup and phone-to-phone transfer will then carry them to a new phone, and anyone who can read your backup or this app\'s data could read them. Without a screen lock, Google backup isn\'t encrypted on your phone, so the keys are left out of it. Android 7 and 8 can\'t encrypt it at all: there, the keys go to Google in plain text.',
    )) return;
    onChange(keepOnDevice);
  };
  return (
    <>
      <h2 className="section-title">API keys</h2>
      <div className="card">
        <label className="toggle-row">
          <input type="checkbox" checked={deviceOnly} disabled={saving} onChange={(event) => change(event.target.checked)} />
          <span>Keep API keys on this device only <span className="hint">(recommended)</span></span>
        </label>
        <p className="hint-text">
          {deviceOnly
            ? 'Encrypted with a key that never leaves this phone. On a new phone, your projects come along and you paste their keys again.'
            : 'Saved unencrypted with your settings, so they move to a new phone with Android backup and transfer. Without a screen lock they\'re left out of Google backup; on Android 7 and 8 they go to Google in plain text. Turning this back on removes them from this phone, but your last backup keeps them until the next one, so change the keys if that matters.'}
        </p>
        {error && <ErrorBanner error={error} />}
      </div>
    </>
  );
}

export function Settings({ projects, activeProjectId, onSelectProject, keysDeviceOnly: deviceOnly, onKeysDeviceOnly }: {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  /** As saved: the toggle only moves once the keys have moved. */
  keysDeviceOnly: boolean;
  onKeysDeviceOnly: (deviceOnly: boolean) => Promise<void>;
}) {
  const baseUrl = projects.find((project) => project.id === activeProjectId)?.baseUrl ?? DEFAULT_BASE_URL;
  const [movingKeys, setMovingKeys] = useState(false);
  const [moveKeysError, setMoveKeysError] = useState<Error>();
  const changeKeysDeviceOnly = (keepOnDevice: boolean) => {
    setMovingKeys(true);
    setMoveKeysError(undefined);
    onKeysDeviceOnly(keepOnDevice).catch(setMoveKeysError).finally(() => setMovingKeys(false));
  };
  const encrypted = platform.secretProtection !== 'none';
  return (
    <>
      <Header title="Settings" back={href({ name: 'list' })} />
      <main className="page">
        <h2 className="section-title">Projects</h2>
        <ul className="list">
          {projects.map((project) => (
            <li key={project.id} className="project-row">
              <button className="project-select-row" onClick={() => onSelectProject(project.id)}>
                <span className="project-active">{project.id === activeProjectId && <CheckMarkIcon />}</span>
                <span className="check-main">
                  <span className="check-name">{project.name}</span>
                  <span className="check-meta">{serverHost(project.baseUrl)} · {keySummary(project)}</span>
                </span>
              </button>
              <a className="edit-button" href={href({ name: 'project', projectId: project.id })} aria-label={`Edit ${project.name}`}>
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
          <KeyProtection deviceOnly={deviceOnly} onChange={changeKeysDeviceOnly} saving={movingKeys} error={moveKeysError} />
        )}

        <UpdateSettings />

        <h2 className="section-title">On healthchecks.io</h2>
        <div className="card card-links">
          <ExternalLink url={webLinks.dashboard(baseUrl)}>Dashboard, projects &amp; integrations</ExternalLink>
          <ExternalLink url={webLinks.accountSettings(baseUrl)}>Account settings</ExternalLink>
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
  );
}

export function ProjectEdit({ project, onSave, onRemove }: {
  project: Project;
  onSave: (editedProject: Project) => Promise<void>;
  onRemove: (projectId: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<Error>();
  const confirmAndRemove = () => {
    if (!confirm(`Remove "${project.name}" from this device?`)) return;
    setRemoving(true);
    setRemoveError(undefined);
    // On success this screen closes; on failure the project stays, and this says why.
    onRemove(project.id).catch((failure: Error) => {
      setRemoveError(failure);
      setRemoving(false);
    });
  };
  return (
    <>
      <Header title="Edit project" back={href({ name: 'settings' })} />
      <main className="page">
        <ProjectForm key={project.id} initial={project} onSave={onSave} />
        {hasApiKey(project) && (
          <p className="footnote">Key type: {keyKind(project)}. Changing the key or server re-checks it before saving.</p>
        )}
        {removeError && <ErrorBanner error={removeError} />}
        <button className="button button-danger" disabled={removing} onClick={confirmAndRemove}>
          {removing ? 'Removing…' : 'Remove project'}
        </button>
      </main>
    </>
  );
}

export function AddProject({ onAdd }: { onAdd: (project: Project) => Promise<void> }) {
  return (
    <>
      <Header title="Add project" back={href({ name: 'settings' })} />
      <main className="page">
        <ProjectForm onSave={onAdd} first />
      </main>
    </>
  );
}

/** The open project has no API key on this device (e.g. after moving to a
 *  new phone: projects come along, keys don't). */
export function NeedsKey({ project, onTryAgain }: { project: Project; onTryAgain: () => void }) {
  if (project.apiKeyUnreadable) {
    return (
      <>
        <Header
          title={APP_NAME}
          right={<a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>}
        />
        <main className="page">
          <section className="card">
            <h2 className="card-title">Couldn't read the API key for {project.name}</h2>
            <p className="desc">
              The key is still saved on this phone, but its secure storage didn't give it back just now. Try again; if
              that keeps failing, restart the phone, or paste the key again.
            </p>
            <button className="button" onClick={onTryAgain}>Try again</button>
            <a className="link-button" href={href({ name: 'project', projectId: project.id })}>Paste the key again</a>
          </section>
        </main>
      </>
    );
  }
  return (
    <>
      <Header
        title={APP_NAME}
        right={<a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>}
      />
      <main className="page">
        <section className="card">
          <h2 className="card-title">Add the API key for {project.name}</h2>
          <p className="desc">
            API keys stay on the phone they were added on, so this project's key needs pasting again here. Other
            projects are in Settings.
          </p>
          <a className="button" href={href({ name: 'project', projectId: project.id })}>Add API key</a>
        </section>
      </main>
    </>
  );
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
  );
}
