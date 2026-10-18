import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { HealthchecksApi } from '../core/api';
import { computeIconAssignmentKey, PRESETS, presetRef, type IconRef } from '../core/icons';
import type { Account } from '../core/types';
import { CheckIcon } from './CheckIcon';
import { useIcons } from './checkIcons';
import { ErrorBanner, Header } from './common';
import { useAsync } from './hooks';
import { loadMoreGlyphs } from './glyphs';
import { IconCropper } from './IconCropper';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from './icons';
import { cropToDataUrl, decodeImage, type DecodedImage } from './imageTools';
import { href } from './routes';

const ACCEPTED_FILES = 'image/*,.heic,.heif,.ico,.svg,.bmp,.avif,.webp';
/** Icons a page shows. Hundreds take a moment to draw on a slow phone, so they come a page at a time. */
const PAGE_SIZE = 100;

/** Choose a check's icon: a preset, one of your uploads, or a new upload
 *  (cropped to a square). Icons other checks use are marked, but can still
 *  be picked. Search narrows the presets down by name; either way they show
 *  a page at a time. */
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

  // Search: closed until the search button opens it, like a ping body's.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Search (iconSearch.ts, with the words it searches) loads as the page opens, so the app starts without it.
  const [search, setSearch] = useState<typeof import('../core/iconSearch')>();
  useEffect(() => {
    import('../core/iconSearch').then(setSearch, () => {});
  }, []);
  const presets = search ? search.searchPresets(query) : PRESETS;
  // The hand-picked icons' glyphs are part of the app. The others' (glyphs.ts) load as the page opens, so later pages
  // and search results have them at once; offline (a web page), those show as plain tiles.
  useEffect(() => {
    loadMoreGlyphs().catch(() => {});
  }, []);

  // A page of the icons; a new search starts again from the first.
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(presets.length / PAGE_SIZE));
  const shownPage = Math.min(page, pageCount - 1); // in case the icons became fewer, as when search loads
  const pageStart = shownPage * PAGE_SIZE;
  const pagePresets = presets.slice(pageStart, pageStart + PAGE_SIZE);
  const iconsHead = useRef<HTMLDivElement>(null);
  const turnPage = (step: number) => {
    setPage(shownPage + step);
    // Previous and Next are under the icons: back up to the top of the new page.
    iconsHead.current?.scrollIntoView({ block: 'nearest' });
  };
  const changeQuery = (newQuery: string) => {
    setQuery(newQuery);
    setPage(0);
  };
  // Closing clears the query, which shows every icon again.
  const toggleSearch = () => {
    setSearchOpen(!searchOpen);
    changeQuery('');
  };
  // Enter puts the phone's keyboard away, to see what was found.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };
  const matchCountText = !query.trim() ? '' : presets.length ? `${presets.length} icon${presets.length === 1 ? '' : 's'}` : 'No matches';

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

            <div className="icon-section-head" ref={iconsHead}>
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
                  onChange={(event) => changeQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search"
                  aria-label="Search icons"
                  autoFocus
                />
                <span className="viewer-search-count" role="status">{matchCountText}</span>
              </div>
            )}
            <div className="icon-grid">
              {pagePresets.map((preset) => choice(presetRef(preset.id), preset.label))}
            </div>
            {pageCount > 1 && (
              <div className="icon-pager">
                <button className="viewer-toggle viewer-icon-toggle" onClick={() => turnPage(-1)} disabled={shownPage === 0} aria-label="Previous page">
                  <ChevronLeftIcon />
                </button>
                <span className="icon-pager-range" aria-live="polite">
                  {pageStart + 1}–{pageStart + pagePresets.length} of {presets.length}
                </span>
                <button className="viewer-toggle viewer-icon-toggle" onClick={() => turnPage(1)} disabled={shownPage === pageCount - 1} aria-label="Next page">
                  <ChevronRightIcon />
                </button>
              </div>
            )}
            {presets.length === 0 && <p className="empty icon-no-match">No icons match “{query.trim()}”. You can upload your own image above.</p>}
            <p className="hint-text">A dot marks icons other checks in this project use; you can still pick them.</p>
          </>
        )}
      </main>
    </>
  );
}
