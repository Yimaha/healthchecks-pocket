import { useState, type FormEvent } from 'react';
import { createApi, HEALTHCHECKS_HOST, looksReadOnly } from '@/core/api/client';
import { DEMO_KEY } from '@/core/api/demo';
import type { Project } from '@/core/projects/project';
import { DEFAULT_PING_LOG_DAYS, isPingLogDays, PING_LOG_DAY_CHOICES, pingLogDaysText, type PingLogDays } from '@/core/projects/pingLogRange';
import { apiKeyFromPasted, hasApiKey, newProjectId, withoutInvisibleCharacters } from '@/core/projects/savedProjects';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { capitalizedKeyKind } from './keyKind';
import { KeyStorageNotice } from './KeyStorageNotice';

/** Add a project, or edit one (`initial`). A new or changed key is checked
 *  against the API before saving. */
export function ProjectForm({ initial, onSave, first }: {
  initial?: Project;
  onSave: (project: Project) => Promise<void>;
  first?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [pingLogDays, setPingLogDays] = useState<PingLogDays>(initial?.pingLogDays ?? DEFAULT_PING_LOG_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  // The saved key's kind is known; a changed key's is checked when it's saved.
  const holdsSavedKey = !!initial && hasApiKey(initial) && withoutInvisibleCharacters(apiKey) === initial.apiKey;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const key = apiKeyFromPasted(apiKey);
      let readOnly = initial?.readOnly ?? false;
      if (!initial || key !== initial.apiKey) {
        readOnly = looksReadOnly(await createApi({ apiKey: key }).listChecks());
      }
      // Awaited: if saving fails, the form stays as typed and shows why.
      await onSave({
        id: initial?.id ?? newProjectId(),
        name: name.trim() || (key === DEMO_KEY ? 'Demo project' : HEALTHCHECKS_HOST),
        apiKey: key,
        readOnly,
        pingLogDays,
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
        {holdsSavedKey && <span className="hint">{capitalizedKeyKind(initial)}</span>}
      </label>
      {/* A read-only key can't read pings, so its project has no ping log to set. */}
      {!(holdsSavedKey && initial.readOnly) && (
        <label>
          <span>Ping log: last {pingLogDaysText(pingLogDays)}</span>
          <input
            type="range"
            min={PING_LOG_DAY_CHOICES[0]}
            max={PING_LOG_DAY_CHOICES[PING_LOG_DAY_CHOICES.length - 1]}
            step={1}
            value={pingLogDays}
            aria-valuetext={pingLogDaysText(pingLogDays)}
            onChange={(event) => {
              const chosenPingLogDays = Number(event.target.value);
              if (isPingLogDays(chosenPingLogDays)) setPingLogDays(chosenPingLogDays);
            }}
          />
        </label>
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
