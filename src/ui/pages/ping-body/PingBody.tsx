import {
  Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent,
} from 'react';
import type { HealthchecksApi } from '@/core/api/client';
import { DEFAULT_TEXT_SIZE, pinchSize, snapSize, TEXT_SIZES } from '@/core/ping-body/textSizes';
import { assembleBody, MAX_SHOWN_BODY_LENGTH, readBody, searchLines, type AssembledLine, type LinePiece } from '@/core/ping-body/pingBody';
import { platform } from '@/platform';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { Header } from '@/ui/components/Header';
import { useAsync } from '@/ui/hooks/useAsync';
import { useStoredFlag, useStoredNumber } from '@/ui/hooks/useStored';
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, SearchIcon, ShareIcon } from '@/ui/components/InterfaceIcons';
import { href } from '@/ui/routes';

/** The body sent with a check's ping, with levelled lines highlighted and
 *  links that open in the browser, and tools to read it comfortably (text
 *  size, pinch to zoom, wrapping, search) or pass it on. View settings are
 *  remembered on this device for every ping. */
export function PingBody({ api, checkId, pingNumber }: { api: HealthchecksApi; checkId: string; pingNumber: number }) {
  const check = useAsync(() => api.getCheck(checkId), [api, checkId]);
  const checkRegularKey = check.data?.uuid;
  const body = useAsync<string | null | undefined>(
    () => (checkRegularKey ? api.pingBody(checkRegularKey, pingNumber) : Promise.resolve(undefined)),
    [api, checkRegularKey, pingNumber],
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

  // Search: closed until the search button opens it, so the toolbar stays small on a phone.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  // The body is read once, searched once per query, and assembled from the two for drawing (see core/pingBody).
  const shown = useMemo(() => readBody(text ?? ''), [text]);
  const search = useMemo(() => searchLines(shown.lines.map((line) => line.text), query), [shown, query]);
  const assembledLines = useMemo(() => assembleBody(shown.lines, search), [shown, search]);
  const matchCount = search.count;
  const bodyElement = useRef<HTMLPreElement>(null);
  // Centred, so the sticky header and search can't cover it; "inline" scrolls an unwrapped line sideways to it too.
  // A match cut by a link's edge is drawn as two marks: this scrolls to the first.
  useLayoutEffect(() => {
    bodyElement.current?.querySelector('.body-match-current')?.scrollIntoView({ block: 'center', inline: 'center' });
  }, [assembledLines, currentMatch]);
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
      <Header title={`Ping #${pingNumber}`} back={href({ name: 'check', checkId })} right={right} />
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
                {shown.isCut && (
                  <p className="viewer-search-cut">
                    Searches only the {MAX_SHOWN_BODY_LENGTH.toLocaleString()} characters shown: matches after them aren't counted.
                  </p>
                )}
              </div>
            )}
            {shown.isCut && <CutBodyNotice bodyLength={text.length} />}
            <pre
              ref={bodyElement}
              className={`body${wrap ? '' : ' body-nowrap'}`}
              style={{ fontSize: `${pinching ?? size}px` }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
              {shown.isCut && <CutBody lines={assembledLines} currentMatch={currentMatch} />}
              {!shown.isCut && <BodyLines lines={assembledLines} currentMatch={currentMatch} />}
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

/** The start of a body too long to show whole, as plain text (its lines have no level or links), then a "..." line
 *  and a note that it's cut. memo: not drawn again on every pinch-zoom frame. */
const CutBody = memo(function CutBody({ lines, currentMatch }: { lines: AssembledLine[]; currentMatch: number }) {
  return (
    <>
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && '\n'}
          <LineParts line={line} currentMatch={currentMatch} />
        </Fragment>
      ))}
      {'\n...\n'}
      <span className="line-warn">Body is trimmed as it's too long.</span>
    </>
  );
});

/** The body's lines, highlighted by log level, with their links and search matches. memo: not drawn again on every
 *  pinch-zoom frame. */
const BodyLines = memo(function BodyLines({ lines, currentMatch }: { lines: AssembledLine[]; currentMatch: number }) {
  return lines.map((line, lineIndex) => (
    <span key={lineIndex} className={`line line-${line.level}`}>
      <LineParts line={line} currentMatch={currentMatch} />
      {/* The line break itself: the lines are inline spans, so without it they would run together. */}
      {'\n'}
    </span>
  ));
});

/** A line's parts as assembleBody gave them: its text, and its links. */
function LineParts({ line, currentMatch }: { line: AssembledLine; currentMatch: number }) {
  return line.parts.map((part, partIndex) => {
    const pieces = <LinePieces pieces={part.pieces} currentMatch={currentMatch} />;
    return part.kind === 'link'
      ? <BodyLink key={partIndex} url={part.url}>{pieces}</BodyLink>
      : <Fragment key={partIndex}>{pieces}</Fragment>;
  });
}

/** A link in the body, which the system opens (a browser tab, not this page). */
function BodyLink({ url, children }: { url: string; children: ReactNode }) {
  const openInBrowser = (event: MouseEvent) => {
    event.preventDefault();
    platform.openExternal(url);
  };
  return <a className="body-link" href={url} onClick={openInBrowser}>{children}</a>;
}

/** A part's text, with its pieces in a search match marked; a mark joining its neighbour has no edge on that side. */
function LinePieces({ pieces, currentMatch }: { pieces: LinePiece[]; currentMatch: number }) {
  return pieces.map((piece, pieceIndex) => {
    if (piece.match === undefined) return piece.text;
    const className = [
      'body-match',
      piece.match.number === currentMatch && 'body-match-current',
      piece.match.joinsPrevious && 'body-match-joins-previous',
      piece.match.joinsNext && 'body-match-joins-next',
    ].filter(Boolean).join(' ');
    return <mark key={pieceIndex} className={className}>{piece.text}</mark>;
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
