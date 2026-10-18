import { startTransition, useDeferredValue, useEffect, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { HealthchecksApi } from '../core/api';
import { computeIconAssignmentKey, PRESETS, presetRef, type IconRef } from '../core/icons';
import type { Account } from '../core/types';
import { CheckIcon } from './CheckIcon';
import { useIcons } from './checkIcons';
import { ErrorBanner, Header } from './common';
import { useAsync } from './hooks';
import { loadMoreGlyphs } from './glyphs';
import { IconCropper } from './IconCropper';
import { SearchIcon } from './icons';
import { cropToDataUrl, decodeImage, type DecodedImage } from './imageTools';
import { href } from './routes';

const ACCEPTED_FILES = 'image/*,.heic,.heif,.ico,.svg,.bmp,.avif,.webp';
/** Icons drawn as the page opens; the rest follow just after (see drawAll). */
const FIRST_DRAWN = 100;

/** Choose a check's icon: a preset, one of your uploads, or a new upload
 *  (cropped to a square). Icons other checks use are marked, but can still
 *  be picked. Search narrows the presets down by name. */
export function IconPicker({ api, account, id }: { api: HealthchecksApi; account: Account; id: string }) {
  const check = useAsync(() => api.getCheck(id), [api, id]);
  const icons = useIcons();
  const iconAssignmentKey = computeIconAssignmentKey(account.id, id);
  const currentIcon = icons.savedIconsByCheck[iconAssignmentKey] ?? (check.data && icons.iconForCheck(account.id, check.data));
  const [image, setImage] = useState<DecodedImage>();
  const [error, setError] = useState<Error>();

  // Icons of the project's other live checks (as of its latest list).
  const usedByOthers = icons.iconsUsedByOtherChecks(account.id, iconAssignmentKey);
  const choose = (iconRef: IconRef) => {
    icons.assign(iconAssignmentKey, iconRef);
    history.back();
  };

  // Search: closed until the search button opens it, like a ping body's. The icons follow the query a moment
  // behind (deferred), so typing stays quick while hundreds of icons are drawn again.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shownQuery = useDeferredValue(query);
  // Search (iconSearch.ts, with the words it searches) loads as the page opens, so the app starts without it.
  const [search, setSearch] = useState<typeof import('../core/iconSearch')>();
  useEffect(() => {
    import('../core/iconSearch').then(setSearch, () => {});
  }, []);
  const presets = search ? search.searchPresets(shownQuery) : PRESETS;
  // Hundreds of icons take a moment to draw on a slow phone: the first ones (hand-picked, their glyphs part of the
  // app) at once, the rest once their glyphs have loaded (glyphs.ts), in the background (a transition), so the page
  // opens and answers taps right away. Without those glyphs (a web page offline), the rest show as plain tiles.
  const [drawAll, setDrawAll] = useState(false);
  useEffect(() => {
    loadMoreGlyphs().catch(() => {}).then(() => startTransition(() => setDrawAll(true)));
  }, []);
  // Closing clears the query, which shows every icon again.
  const toggleSearch = () => {
    setSearchOpen(!searchOpen);
    setQuery('');
  };
  // Enter puts the phone's keyboard away, to see what was found.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };
  const matchCountText = !shownQuery.trim() ? '' : presets.length ? `${presets.length} icon${presets.length === 1 ? '' : 's'}` : 'No matches';

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // choosing the same file again still works
    if (!file) return;
    setError(undefined);
    try {
      setImage(await decodeImage(file));
    } catch (decodeError) {
      setError(decodeError as Error);
    }
  }

  const choice = (iconRef: IconRef, label: string, extra?: ReactNode) => (
    <div key={iconRef} className="icon-choice">
      <button
        type="button"
        className={`icon-choice-button${iconRef === currentIcon ? ' current' : ''}`}
        aria-label={label + (usedByOthers.has(iconRef) ? ' (in use)' : '')}
        aria-pressed={iconRef === currentIcon}
        onClick={() => choose(iconRef)}
      >
        <CheckIcon iconRef={iconRef} size="md" />
        {usedByOthers.has(iconRef) && <span className="icon-in-use" aria-hidden="true" />}
      </button>
      {extra}
    </div>
  );

  return (
    <>
      <Header title="Icon" back={href({ name: 'check', id })} />
      <main className="page">
        {check.error && <ErrorBanner error={check.error} onRetry={check.reload} />}
        <section className="card icon-current">
          <CheckIcon iconRef={currentIcon} size="lg" />
          <span className="check-name">{check.data?.name || check.data?.slug || 'Check'}</span>
        </section>

        {image ? (
          <IconCropper
            image={image}
            onCancel={() => setImage(undefined)}
            onSave={(box) => choose(`custom:${icons.addUpload(cropToDataUrl(image, box))}`)}
          />
        ) : (
          <>
            <h2 className="section-title">Your icons</h2>
            {error && <ErrorBanner error={error} />}
            <div className="icon-grid">
              {Object.keys(icons.uploads).map((uploadId) => choice(`custom:${uploadId}`, 'Your icon', (
                <button
                  type="button"
                  className="icon-delete"
                  aria-label="Delete this icon"
                  onClick={() => {
                    if (confirm('Delete this icon? Checks using it go back to their default icon.')) icons.removeUpload(uploadId);
                  }}
                >
                  ×
                </button>
              )))}
              <label className="icon-upload">
                <input type="file" accept={ACCEPTED_FILES} onChange={upload} aria-label="Upload an image" />
                <span aria-hidden="true">+</span>
                <span className="icon-upload-text">Upload</span>
              </label>
            </div>
            <p className="hint-text">PNG, JPEG, WebP, GIF, BMP, AVIF, SVG or ICO. You crop it to a square next.</p>

            <div className="icon-section-head">
              <h2 className="section-title">Icons</h2>
              <button className="viewer-toggle viewer-icon-toggle" onClick={toggleSearch} aria-pressed={searchOpen} aria-label="Search icons">
                <SearchIcon />
              </button>
            </div>
            {searchOpen && (
              <div className="viewer-search" role="search">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search"
                  aria-label="Search icons"
                  autoFocus
                />
                <span className="viewer-search-count" role="status">{matchCountText}</span>
              </div>
            )}
            <div className="icon-grid">
              {(drawAll ? presets : presets.slice(0, FIRST_DRAWN)).map((preset) => choice(presetRef(preset.id), preset.label))}
            </div>
            {presets.length === 0 && <p className="empty icon-no-match">No icons match “{shownQuery.trim()}”. You can upload your own image above.</p>}
            <p className="hint-text">A dot marks icons other checks in this project use; you can still pick them.</p>
          </>
        )}
      </main>
    </>
  );
}
