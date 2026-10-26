import { useEffect, useState } from 'react';
import { RefreshIcon } from './InterfaceIcons';

const MIN_MANUAL_SPIN_MS = 800;

/** Refresh button. A tap spins the icon for at least one full turn and runs
 *  a progress bar along the header until the data is in, so a fast refresh
 *  is still visible. Background auto-refreshes only spin the icon. */
export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const [manualSince, setManualSince] = useState<number | null>(null);

  useEffect(() => {
    if (manualSince === null || loading) {
      return;
    }
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
