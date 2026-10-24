import type { Flip } from '@/core/api/types';
import { dateTime, relative } from '@/core/checks/format';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { Section } from '@/ui/components/Section';
import type { Async } from '@/ui/hooks/useAsync';
import { useTimeZone } from '@/ui/state/timeZoneState';

/** The check's status changes in the last 30 days, newest first, in a section that folds. */
export function StatusChanges({ flips, now }: { flips: Async<Flip[]>; now: number }) {
  const { tz } = useTimeZone();
  return (
    <Section id="flips" title="Status changes (30 days)" count={flips.data?.length}>
      <p className="hint-text section-hint">
        Down means a late or failure ping. healthchecks.io also records pausing and resuming as not up.
      </p>
      {flips.error && <ErrorBanner error={flips.error} onRetry={flips.reload} />}
      {flips.data === undefined && !flips.error && <p className="empty">Loading status changes…</p>}
      {flips.data && flips.data.length === 0 && <p className="empty">No status changes in the last 30 days.</p>}
      {flips.data && flips.data.length > 0 && (
        <ul className="list">
          {withStatusChangeRowKeys([...flips.data].sort((first, second) => second.timestamp.localeCompare(first.timestamp))).map(({ flip, statusChangeRowKey }) => (
            <li key={statusChangeRowKey} className="flip-row">
              <span className={`flip flip-${flip.up ? 'up' : 'down'}`}>{flip.up ? 'Went up' : 'Down or paused'}</span>
              <span className="check-meta">{relative(flip.timestamp, now)} · {dateTime(flip.timestamp, tz)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Each status change with a React key for its row: its time, numbered when several changes share that time (healthchecks.io records them to the second). */
function withStatusChangeRowKeys(sortedFlips: Flip[]): { flip: Flip; statusChangeRowKey: string }[] {
  const flipCountByTimestamp = new Map<string, number>();
  return sortedFlips.map((flip) => {
    const earlierFlipsAtTimestamp = flipCountByTimestamp.get(flip.timestamp) ?? 0;
    flipCountByTimestamp.set(flip.timestamp, earlierFlipsAtTimestamp + 1);
    return { flip, statusChangeRowKey: `${flip.timestamp}#${earlierFlipsAtTimestamp}` };
  });
}
