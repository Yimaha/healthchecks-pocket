import { useEffect, useState, type ReactNode } from 'react';
import { STATUS_LABEL } from '@/core/format';
import type { CheckStatus } from '@/core/types';
import { platform } from '@/platform';
import { useStoredFlag } from './hooks';
import { BackIcon, ChevronIcon, ExternalIcon, RefreshIcon } from './icons';
import { goBackTo, parseRoute } from './routes';

// ------------------------------------------------------------- components

export function StatusDot({ status, started }: { status: CheckStatus; started?: boolean }) {
  return <span className={`dot dot-${status}${started ? ' dot-started' : ''}`} aria-hidden="true" />;
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Header({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="header">
      {back ? (
        <a
          className="header-back"
          href={back}
          aria-label="Back"
          onClick={(event) => { event.preventDefault(); goBackTo(parseRoute(back)); }}
        >
          <BackIcon />
        </a>
      ) : <span className="header-spacer" />}
      <h1 className="header-title">{title}</h1>
      <div className="header-right">{right}</div>
    </header>
  );
}

export function ErrorBanner({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <span>{error.message}</span>
      {onRetry && <button className="link-button" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function ExternalLink({ url, children, detail }: { url: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <a
      className="row-link"
      href={url}
      onClick={(event) => { event.preventDefault(); platform.openExternal(url); }}
    >
      <span className="check-main">
        <span className="row-link-label">{children}</span>
        {detail && <span className="check-meta">{detail}</span>}
      </span>
      <ExternalIcon />
    </a>
  );
}

/** Section with a tappable title that folds its content. The open/closed
 *  state is remembered per section on this device. */
export function Section({ id, title, count, children }: {
  id: string;
  title: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useStoredFlag(`section.${id}`, true);
  return (
    <section>
      <button className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="section-title-text">
          {title}
          {count != null && <span className="section-count">{count}</span>}
        </span>
        <span className={`section-chevron${open ? ' open' : ''}`}><ChevronIcon /></span>
      </button>
      {open && children}
    </section>
  );
}

const MIN_MANUAL_SPIN_MS = 800;

/** Refresh button. A tap spins the icon for at least one full turn and runs
 *  a progress bar along the header until the data is in, so a fast refresh
 *  is still visible. Background auto-refreshes only spin the icon. */
export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const [manualSince, setManualSince] = useState<number | null>(null);

  useEffect(() => {
    if (manualSince === null || loading) return;
    const left = MIN_MANUAL_SPIN_MS - (Date.now() - manualSince);
    const timer = setTimeout(() => setManualSince(null), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [manualSince, loading]);

  const manual = manualSince !== null;
  return (
    <>
      <button
        className="icon-button"
        onClick={() => { setManualSince(Date.now()); onClick(); }}
        aria-label="Refresh"
        aria-busy={loading || manual}
        disabled={loading || manual}
      >
        <RefreshIcon spinning={loading || manual} />
      </button>
      {manual && <span className="header-progress" role="progressbar" aria-label="Refreshing" />}
    </>
  );
}
