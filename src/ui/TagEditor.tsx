import { useState, type KeyboardEvent } from 'react'
import { ErrorBanner } from './common'

/** Edit a check's tags. Tags can't contain spaces (the API stores them
 *  space-delimited), so typing a space or comma finishes a tag. */
export function TagEditor({ initial, suggestions, onSave, onCancel }: {
  initial: string[]
  suggestions: string[]
  onSave: (tags: string[]) => Promise<void>
  onCancel: () => void
}) {
  const [tags, setTags] = useState(initial)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error>()

  // Updates go through the functional form so quick successive taps (remove,
  // then add) each build on the latest list.
  const add = (raw: string) => {
    const typed = raw.split(/[\s,]+/).filter(Boolean)
    setTags((cur) => [...cur, ...typed.filter((t, i) => !cur.includes(t) && typed.indexOf(t) === i)])
    setDraft('')
  }
  const remove = (tag: string) => setTags((cur) => cur.filter((t) => t !== tag))

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      setTags((cur) => cur.slice(0, -1))
    }
  }

  async function save() {
    setBusy(true)
    setError(undefined)
    try {
      // Include a half-typed tag rather than silently dropping it.
      const final = draft.trim() ? [...tags, ...draft.split(/[\s,]+/).filter((t) => t && !tags.includes(t))] : tags
      await onSave(final)
    } catch (e) {
      setError(e as Error)
      setBusy(false)
    }
  }

  const unused = suggestions.filter((s) => !tags.includes(s))

  return (
    <div className="tag-editor">
      <div className="tag-input">
        {tags.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => remove(t)}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => (/[\s,]/.test(e.target.value) ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={onKeyDown}
          placeholder={tags.length ? 'Add tag' : 'Add a tag, e.g. pi'}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="New tag"
        />
      </div>
      {unused.length > 0 && (
        <div className="tag-suggestions">
          <span className="hint">Used in this project:</span>
          {unused.map((s) => (
            <button key={s} type="button" className="tag tag-suggestion" onClick={() => add(s)}>+ {s}</button>
          ))}
        </div>
      )}
      {error && <ErrorBanner error={error} />}
      <div className="tag-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save tags'}</button>
      </div>
      <p className="hint-text">Saved to healthchecks.io, so they show up there and on every device.</p>
    </div>
  )
}
