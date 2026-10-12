import { useState, type FormEvent } from 'react'
import { ErrorBanner } from './common'

/** Healthchecks.io's limit for a check's name. */
const MAX_NAME = 100

/** Rename a check (saved to healthchecks.io). */
export function NameEditor({ initial, onSave, onCancel }: {
  initial: string
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error>()
  const trimmed = name.trim()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || trimmed === initial) return onCancel()
    setBusy(true)
    setError(undefined)
    try {
      await onSave(trimmed)
    } catch (err) {
      setError(err as Error)
      setBusy(false)
    }
  }

  return (
    <form className="tag-editor" onSubmit={save}>
      <input
        className="name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        maxLength={MAX_NAME}
        aria-label="Check name"
        autoComplete="off"
        autoFocus
      />
      {error && <ErrorBanner error={error} />}
      <div className="tag-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="button" disabled={busy || !trimmed}>{busy ? 'Saving…' : 'Save name'}</button>
      </div>
    </form>
  )
}
