import { useState } from 'react';
import type { HealthchecksApi } from '@/core/api/client';
import { hasReadOnlyId, hasRegularId, type Flip } from '@/core/api/types';
import type { Project } from '@/core/projects/project';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { Header } from '@/ui/components/Header';
import { RefreshButton } from '@/ui/components/RefreshButton';
import { useAsync } from '@/ui/hooks/useAsync';
import { useAutoRefresh } from '@/ui/hooks/useAutoRefresh';
import { href } from '@/ui/routes';
import { CheckDetailForReadOnlyKey } from './CheckDetailForReadOnlyKey';
import { CheckDetailForRegularKey } from './CheckDetailForRegularKey';

/** A check's screen: loads the check, then shows the screen for the kind of API key healthchecks.io sent it to. A
 *  read-only key can't read pings or change the check, so its screen has neither. */
export function CheckDetail({ api, project, checkId }: { api: HealthchecksApi; project: Project; checkId: string }) {
  const check = useAsync(() => api.getCheck(checkId), [api, checkId]);
  // Both screens show the status changes, so they load alongside the check rather than after it.
  const flips = useAsync<Flip[]>(() => api.listFlips(checkId, 30 * 86400), [api, checkId]);
  // Each refresh bumps it, and the screen for a regular key reloads its ping log with it.
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = () => { check.reload(); flips.reload(); setRefreshCount((count) => count + 1); };
  useAutoRefresh(refresh, 60_000, check.loading || flips.loading);

  return (
    <>
      <Header
        title={check.data?.name || 'Check'}
        back={href({ name: 'list' })}
        right={<RefreshButton loading={check.loading} onClick={refresh} />}
      />
      <main className="page">
        {check.error && <ErrorBanner error={check.error} onRetry={refresh} />}
        {!check.data && check.loading && <p className="empty">Loading…</p>}
        {/* By the check healthchecks.io sent, not the project's saved readOnly: that's a guess made when its key was added. */}
        {check.data && hasRegularId(check.data) && (
          <CheckDetailForRegularKey api={api} project={project} check={check.data} flips={flips} refreshCount={refreshCount} reloadCheck={check.reload} />
        )}
        {check.data && hasReadOnlyId(check.data) && <CheckDetailForReadOnlyKey project={project} check={check.data} flips={flips} />}
      </main>
    </>
  );
}
