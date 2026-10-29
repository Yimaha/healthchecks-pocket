import type { CheckWithReadOnlyId, Flip } from '@/core/api/types';
import type { Project } from '@/core/projects/project';
import type { Async } from '@/ui/hooks/useAsync';
import { useNow } from '@/ui/hooks/useNow';
import { CheckStatusCard } from './CheckStatusCard';
import { StatusChanges } from './StatusChanges';

/** The screen for a check healthchecks.io sent to a read-only API key, which can't read pings or change the check: its
 *  status, details and status changes, and nothing about the rest. Its icon still changes: that's saved on the phone. */
export function CheckDetailForReadOnlyKey({ project, check, flips }: { project: Project; check: CheckWithReadOnlyId; flips: Async<Flip[]> }) {
  const now = useNow();
  return (
    <>
      <CheckStatusCard project={project} checkId={check.unique_key} check={check} flips={flips.data} now={now} />
      <StatusChanges flips={flips} now={now} />
    </>
  );
}
