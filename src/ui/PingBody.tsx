import { findAll } from 'highlight-words-core';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent } from 'react';
import type { HealthchecksApi } from '../core/api';
import { DEFAULT_TEXT_SIZE, lineLevel, linkify, pinchSize, snapSize, TEXT_SIZES, type LinePart } from '../core/format';
import { platform } from '../platform';
import { ErrorBanner, Header } from './common';
import { useAsync, useStoredFlag, useStoredNumber } from './hooks';
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, SearchIcon, ShareIcon } from './icons';
import { href } from './routes';

/** The most of a body the page shows, in characters. A ping's body is a short summary of a run: a longer log belongs
 *  with the service that sent it. A longer body is shown cut, as plain text, since parsing it isn't worth the time. */
const MAX_SHOWN_BODY_LENGTH = 10_000;

/** The body sent with a check's ping, with levelled lines highlighted and
 *  links that open in the browser, and tools to read it comfortably (text
 *  size, pinch to zoom, wrapping, search) or pass it on. View settings are
 *  remembered on this device for every ping. */
export function PingBody({ api, id, pingNumber }: { api: HealthchecksApi; id: string; pingNumber: number }) {
  const check = useAsync(() => api.getCheck(id), [api, id]);
  const uuid = check.data?.uuid;
  const body = useAsync<string | null | undefined>(
    () => (uuid ? api.pingBody(uuid, pingNumber) : Promise.resolve(undefined)),
    [api, uuid, pingNumber],
  );
  const [stored, setSize] = useStoredNumber('pingBody.size', DEFAULT_TEXT_SIZE, TEXT_SIZES[0], TEXT_SIZES[TEXT_SIZES.length - 1]);
  const size = snapSize(stored);
  const [wrap, setWrap] = useStoredFlag('pingBody.wrap', true);
  const [notice, setNotice] = useState<string>();
  // Pinch to zoom: the size follows the fingers, then snaps to a step.
  const [pinching, setPinching] = useState<number>();
  const pinchStart = useRef<{ size: number; distance: number }>(undefined);
  const distance = (event: TouchEvent) => {
    const [first, second] = [event.touches[0], event.touches[1]];
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  };
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) pinchStart.current = { size, distance: distance(event) };
  };
  const onTouchMove = (event: TouchEvent) => {
    const start = pinchStart.current;
    if (start && event.touches.length === 2) setPinching(pinchSize(start.size, start.distance, distance(event)));
  };
  const onTouchEnd = () => {
    if (pinching !== undefined) setSize(snapSize(pinching));
    pinchStart.current = undefined;
    setPinching(undefined);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  const text = body.data;
  const isBodyCut = (text?.length ?? 0) > MAX_SHOWN_BODY_LENGTH;

  // Search: closed until the search button opens it, so the toolbar stays small on a phone.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const bodyElement = useRef<HTMLPreElement>(null);
  // The marks drawn are the matches, in reading order: count them, then flag and show the current one. Its class is set
  // here rather than drawn, since which mark is current depends on how many come before it, in other lines and links.
  useLayoutEffect(() => {
    const marks = [...(bodyElement.current?.querySelectorAll('mark') ?? [])];
    setMatchCount(marks.length);
    marks.forEach((mark, markIndex) => mark.classList.toggle('body-match-current', markIndex === currentMatch));
    // Centred, so the sticky header and search can't cover it; "inline" scrolls an unwrapped line sideways to it too.
    marks[currentMatch]?.scrollIntoView({ block: 'center', inline: 'center' });
  }, [text, query, currentMatch]);
  const changeQuery = (newQuery: string) => {
    setQuery(newQuery);
    setCurrentMatch(0);
  };
  // Closing clears the query, which takes the highlights away.
  const toggleSearch = () => {
    setSearchOpen(!searchOpen);
    changeQuery('');
  };
  // From the last match on to the first, and back.
  const stepMatch = (step: number) => {
    if (matchCount) setCurrentMatch((currentMatch + step + matchCount) % matchCount);
  };
  const onSearchKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    stepMatch(event.shiftKey ? -1 : 1);
  };
  const matchCountText = !query ? '' : matchCount ? `${currentMatch + 1} of ${matchCount}` : 'No matches';
  const title = `${check.data?.name || 'Check'} · ping #${pingNumber}`;
  // The body loads only once the check has, so after a failed check load, Retry must load the check again.
  const retryFailedLoad = check.error ? check.reload : body.reload;
  const copy = () => {
    if (!text) return;
    platform.copyText(text).then(() => setNotice('Copied'), () => setNotice("Couldn't copy"));
  };
  const share = platform.shareText && (() => {
    if (text) platform.shareText?.(title, text).catch(() => setNotice("Couldn't share"));
  });

  const right = (
    <>
      <button className="icon-button" onClick={copy} disabled={!text} aria-label="Copy"><CopyIcon /></button>
      {share && <button className="icon-button" onClick={share} disabled={!text} aria-label="Share"><ShareIcon /></button>}
    </>
  );

  return (
    <>
      <Header title={`Ping #${pingNumber}`} back={href({ name: 'check', id })} right={right} />
      <main className="page">
        {(check.error || body.error) && <ErrorBanner error={(check.error || body.error)!} onRetry={retryFailedLoad} />}
        {body.loading && <p className="empty">Loading…</p>}
        {!body.loading && body.data === null && <p className="empty">This ping has no body.</p>}
        {text && (
          <>
            <div className="viewer-bar" role="toolbar" aria-label="Text view">
              <TextSize size={size} onChange={setSize} />
              <button className="viewer-toggle" onClick={() => setWrap(!wrap)} aria-pressed={wrap}>Wrap</button>
              <button className="viewer-toggle viewer-icon-toggle" onClick={toggleSearch} aria-pressed={searchOpen} aria-label="Search">
                <SearchIcon />
              </button>
            </div>
            {/* Outside the toolbar, so it can stick under the header for the whole body (see .viewer-search). */}
            {searchOpen && (
              <div className="viewer-search" role="search">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => changeQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search"
                  aria-label="Search the body"
                  autoFocus
                />
                <span className="viewer-search-count" role="status">{matchCountText}</span>
                <button className="viewer-toggle viewer-icon-toggle" onClick={() => stepMatch(-1)} disabled={!matchCount} aria-label="Previous match">
                  <ChevronUpIcon />
                </button>
                <button className="viewer-toggle viewer-icon-toggle" onClick={() => stepMatch(1)} disabled={!matchCount} aria-label="Next match">
                  <ChevronDownIcon />
                </button>
                {isBodyCut && (
                  <p className="viewer-search-cut">
                    Searches only the {MAX_SHOWN_BODY_LENGTH.toLocaleString()} characters shown: matches after them aren't counted.
                  </p>
                )}
              </div>
            )}
            {isBodyCut && <CutBodyNotice bodyLength={text.length} />}
            <pre
              ref={bodyElement}
              className={`body${wrap ? '' : ' body-nowrap'}`}
              style={{ fontSize: `${pinching ?? size}px` }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
              {isBodyCut && <CutBody text={text} query={query} />}
              {!isBodyCut && <BodyLines text={text} query={query} />}
            </pre>
          </>
        )}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    </>
  );
}

/** Says that only the start of a long body is shown, and where the rest is. */
function CutBodyNotice({ bodyLength }: { bodyLength: number }) {
  return (
    <div className="notice notice-warn body-cut-notice" role="note">
      <p>
        <strong>Body too long: showing the first {MAX_SHOWN_BODY_LENGTH.toLocaleString()} of {bodyLength.toLocaleString()} characters.</strong>
        It's shown as plain text, without highlighting or links. Copy and Share still give the whole body. For logs this
        long, keep them with the service that sends the ping.
      </p>
    </div>
  );
}

/** The start of a body too long to show whole, as plain text (not parsed), then a "..." line and a note that it's cut.
 *  Only the start is searched. memo: not drawn again on every pinch-zoom frame. */
const CutBody = memo(function CutBody({ text, query }: { text: string; query: string }) {
  return (
    <>
      <TextWithMatches text={text.slice(0, MAX_SHOWN_BODY_LENGTH)} query={query} />
      {'\n...\n'}
      <span className="line-warn">Body is trimmed as it's too long.</span>
    </>
  );
});

/** The body's lines, highlighted by log level, with their links and search matches. Parsed once per body, not again
 *  as the search changes; memo: not drawn again on every pinch-zoom frame either. */
const BodyLines = memo(function BodyLines({ text, query }: { text: string; query: string }) {
  const lines = useMemo(() => text.split('\n').map((line) => ({ level: lineLevel(line), parts: linkify(line) })), [text]);
  return lines.map((line, lineIndex) => (
    <span key={lineIndex} className={`line line-${line.level}`}>
      {line.parts.map((part, partIndex) => <BodyLinePart key={partIndex} part={part} query={query} />)}
      {/* The line break itself: the lines are inline spans, so without it they would run together. */}
      {'\n'}
    </span>
  ));
});

/** One part of a body line: its text as sent, or a link that the system opens (a browser tab, not this page). */
function BodyLinePart({ part, query }: { part: LinePart; query: string }) {
  if (part.kind === 'text') {
    return <TextWithMatches text={part.text} query={query} />;
  }
  const openInBrowser = (event: MouseEvent) => {
    event.preventDefault();
    platform.openExternal(part.url);
  };
  return (
    <a className="body-link" href={part.url} onClick={openInBrowser}>
      <TextWithMatches text={part.url} query={query} />
    </a>
  );
}

/** Text with each match of the query marked: found by highlight-words-core, as plain text in any case. Each line part
 *  is searched on its own, so a match can't run from text into a link. */
function TextWithMatches({ text, query }: { text: string; query: string }) {
  if (!query) return text;
  return findAll({ searchWords: [query], textToHighlight: text }).map(({ start, end, highlight }) => {
    const chunkText = text.slice(start, end);
    return highlight ? <mark key={start} className="body-match">{chunkText}</mark> : chunkText;
  });
}

/** A− size A+, stepping through TEXT_SIZES (also used by onboarding). */
export function TextSize({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  const step = TEXT_SIZES.indexOf(snapSize(size));
  return (
    <span className="viewer-size">
      <button onClick={() => onChange(TEXT_SIZES[step - 1])} disabled={step <= 0} aria-label="Smaller text">A−</button>
      <span aria-label="Text size">{snapSize(size)}</span>
      <button onClick={() => onChange(TEXT_SIZES[step + 1])} disabled={step >= TEXT_SIZES.length - 1} aria-label="Larger text">A+</button>
    </span>
  );
}
