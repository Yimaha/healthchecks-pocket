import { memo, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import type { HealthchecksApi } from '../core/api';
import { DEFAULT_TEXT_SIZE, lineLevel, linkify, pinchSize, snapSize, TEXT_SIZES, type LinePart } from '../core/format';
import { platform } from '../platform';
import { ErrorBanner, Header } from './common';
import { useAsync, useStoredFlag, useStoredNumber } from './hooks';
import { CopyIcon, ShareIcon } from './icons';
import { href } from './routes';

/** The most of a body the page shows, in characters. A ping's body is a short summary of a run: a longer log belongs
 *  with the service that sent it. A longer body is shown cut, as plain text, since parsing it isn't worth the time. */
const MAX_SHOWN_BODY_LENGTH = 10_000;

/** The body sent with a check's ping, with levelled lines highlighted and
 *  links that open in the browser, and tools to read it comfortably (text
 *  size, pinch to zoom, wrapping) or pass it on. View settings are remembered
 *  on this device for every ping. */
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
            </div>
            {isBodyCut && <CutBodyNotice bodyLength={text.length} />}
            <pre
              className={`body${wrap ? '' : ' body-nowrap'}`}
              style={{ fontSize: `${pinching ?? size}px` }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
              {isBodyCut && <CutBody text={text} />}
              {!isBodyCut && <BodyLines text={text} />}
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

/** The start of a body too long to show whole, as plain text (not parsed), then a "..." line and a note that it's cut. */
function CutBody({ text }: { text: string }) {
  return (
    <>
      {text.slice(0, MAX_SHOWN_BODY_LENGTH)}
      {'\n...\n'}
      <span className="line-warn">Body is trimmed as it's too long.</span>
    </>
  );
}

/** The body's lines, highlighted by log level, with their links. memo: parsed once per body, not on every pinch-zoom frame. */
const BodyLines = memo(function BodyLines({ text }: { text: string }) {
  return text.split('\n').map((line, lineIndex) => (
    <span key={lineIndex} className={`line line-${lineLevel(line)}`}>
      {linkify(line).map((part, partIndex) => <BodyLinePart key={partIndex} part={part} />)}
      {/* The line break itself: the lines are inline spans, so without it they would run together. */}
      {'\n'}
    </span>
  ));
});

/** One part of a body line: its text as sent, or a link that the system opens (a browser tab, not this page). */
function BodyLinePart({ part }: { part: LinePart }) {
  if (part.kind === 'text') {
    return part.text;
  }
  const openInBrowser = (event: MouseEvent) => {
    event.preventDefault();
    platform.openExternal(part.url);
  };
  return <a className="body-link" href={part.url} onClick={openInBrowser}>{part.url}</a>;
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
