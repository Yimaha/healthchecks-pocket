import { useState, type KeyboardEvent } from 'react';
import { ErrorBanner } from '@/ui/components/ErrorBanner';

/** Edit a check's tags. Tags can't contain spaces (the API stores them
 *  space-delimited), so typing a space or comma finishes a tag. */
export function TagEditor({ initial, suggestions, onSave, onCancel }: {
  initial: string[];
  suggestions: string[];
  onSave: (tags: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();

  // Updates go through the functional form so quick successive taps (remove,
  // then add) each build on the latest list.
  const add = (raw: string) => {
    const typed = raw.split(/[\s,]+/).filter(Boolean);
    setTags((current) => [...current, ...typed.filter((tag, i) => !current.includes(tag) && typed.indexOf(tag) === i)]);
    setDraft('');
  };
  const remove = (tag: string) => setTags((current) => current.filter((existing) => existing !== tag));

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && !draft && tags.length) {
      setTags((current) => current.slice(0, -1));
    }
  }

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      // Include a half-typed tag rather than silently dropping it.
      const final = draft.trim() ? [...tags, ...draft.split(/[\s,]+/).filter((tag) => tag && !tags.includes(tag))] : tags;
      await onSave(final);
    } catch (saveError) {
      setError(saveError as Error);
      setBusy(false);
    }
  }

  const unused = suggestions.filter((suggestion) => !tags.includes(suggestion));

  return (
    <div className="tag-editor">
      <div className="tag-input">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => (/[\s,]/.test(event.target.value) ? add(event.target.value) : setDraft(event.target.value))}
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
          {unused.map((suggestion) => (
            <button key={suggestion} type="button" className="tag tag-suggestion" onClick={() => add(suggestion)}>+ {suggestion}</button>
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
  );
}
