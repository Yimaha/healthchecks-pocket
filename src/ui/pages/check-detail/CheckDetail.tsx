import { useState } from 'react';
import { ApiError, HEALTHCHECKS_HOST, webLinks, type HealthchecksApi } from '@/core/api/client';
import { dateTime, durationShort, relative, tagList } from '@/core/checks/format';
import { pingLogDaysText, pingLogRangeStart } from '@/core/projects/pingLogRange';
import type { Flip, Ping } from '@/core/api/types';
import type { Project } from '@/core/projects/project';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { ExternalLink } from '@/ui/components/ExternalLink';
import { Header } from '@/ui/components/Header';
import { RefreshButton } from '@/ui/components/RefreshButton';
import { Section } from '@/ui/components/Section';
import { useAsync } from '@/ui/hooks/useAsync';
import { useAutoRefresh } from '@/ui/hooks/useAutoRefresh';
import { useNow } from '@/ui/hooks/useNow';
import { ChevronIcon, ChevronLeftIcon, ChevronRightIcon } from '@/ui/components/InterfaceIcons';
import { CheckStatusCard } from './CheckStatusCard';
import { NameEditor } from './NameEditor';
import { StatusChanges } from './StatusChanges';
import { TagEditor } from './TagEditor';
import { useTimeZone } from '@/ui/state/timeZoneState';
import { href } from '@/ui/routes';

const PINGS_PER_PAGE = 40; // well under the 100 pings healthchecks.io's free plan keeps, so its log pages too

const PING_LABEL: Record<string, string> = {
  success: 'OK', start: 'Started', fail: 'Failure', log: 'Log', ign: 'Ignored',
};

export function CheckDetail({ api, project, checkId }: { api: HealthchecksApi; project: Project; checkId: string }) {
  const check = useAsync(() => api.getCheck(checkId), [api, checkId]);
  const checkRegularKey = check.data?.uuid;
  // Ping logs need a regular API key, the only kind that gets a check's regular key. null = read-only,
  // undefined = check not loaded yet.
  const readOnly = !!check.data && !checkRegularKey;
  const pings = useAsync<Ping[] | null | undefined>(
    () => (checkRegularKey ? api.listPings(checkRegularKey) : Promise.resolve(readOnly ? null : undefined)),
    [api, checkRegularKey, readOnly],
  );
  const flips = useAsync<Flip[]>(() => api.listFlips(checkId, 30 * 86400), [api, checkId]);
  const now = useNow();
  const { tz } = useTimeZone();
  const [busy, setBusy] = useState(false);
  const [pingPage, setPingPage] = useState(0);
  const [editingTags, setEditingTags] = useState(false);
  const [editingName, setEditingName] = useState(false);
  // Suggestions for the tag editor: every tag used in this project.
  const projectTags = useAsync<string[]>(
    async () => (editingTags ? [...new Set((await api.listChecks()).flatMap(tagList))].sort() : []),
    [api, editingTags],
  );
  const [actionError, setActionError] = useState<Error>();

  const reload = () => { check.reload(); pings.reload(); flips.reload(); };
  useAutoRefresh(reload, 60_000, check.loading || pings.loading || flips.loading);

  // Healthchecks can't filter pings by time, so the project's range is applied here.
  const pingLogStart = pingLogRangeStart(project.pingLogDays, new Date(now));
  const pingsInRange = pings.data?.filter((ping) => new Date(ping.date) >= pingLogStart);
  const oldestKeptPing = pings.data?.[pings.data.length - 1];
  // Healthchecks keeps only a check's latest pings (100 on its free plan): when the oldest it kept is inside the range
  // and isn't the check's first ping, the range's older pings are gone.
  const olderPingsInRangeGone = !!oldestKeptPing && new Date(oldestKeptPing.date) >= pingLogStart && oldestKeptPing.n > 1;
  const pingPageCount = Math.max(1, Math.ceil((pingsInRange?.length ?? 0) / PINGS_PER_PAGE));
  const shownPingPage = Math.min(pingPage, pingPageCount - 1); // in case a refresh left the range with fewer pings
  const pingsOnPage = pingsInRange?.slice(shownPingPage * PINGS_PER_PAGE, (shownPingPage + 1) * PINGS_PER_PAGE);

  async function togglePause() {
    if (!checkRegularKey || !check.data) return;
    const pausing = check.data.status !== 'paused';
    const until = check.data.manual_resume ? 'you resume it here' : 'its next ping (or you resume it here)';
    const question = pausing
      ? `Pause "${check.data.name}"? It won't send alerts until ${until}.`
      // Resume can't be undone: healthchecks.io resets the check to New and
      // clears its last ping, so ask first (the button sits where Pause was).
      : `Resume "${check.data.name}"? It goes back to New, its last ping is cleared, and it alerts again after its next ping.`;
    if (!confirm(question)) return;
    setBusy(true);
    setActionError(undefined);
    try {
      await (pausing ? api.pause(checkRegularKey) : api.resume(checkRegularKey));
      reload();
    } catch (error) {
      setActionError(error as Error);
      // A 409 means the check was resumed elsewhere: show its real status, so the button no longer offers Resume.
      if (error instanceof ApiError && error.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }

  const data = check.data;
  return (
    <>
      <Header
        title={data?.name || 'Check'}
        back={href({ name: 'list' })}
        right={<RefreshButton loading={check.loading} onClick={reload} />}
      />
      <main className="page">
        {check.error && <ErrorBanner error={check.error} onRetry={reload} />}
        {actionError && <ErrorBanner error={actionError} />}
        {!data && check.loading && <p className="empty">Loading…</p>}

        {data && (
          <>
            {/* 1. Status, with the check's details above its last ping */}
            <CheckStatusCard
              project={project}
              checkId={checkId}
              check={data}
              flips={flips.data}
              now={now}
              renameButton={checkRegularKey && !editingName && (
                <button className="link-button tag-edit-link" onClick={() => setEditingName(true)}>Rename</button>
              )}
              editTagsButton={checkRegularKey && !editingTags && (
                <button className="link-button tag-edit-link" onClick={() => setEditingTags(true)}>Edit tags</button>
              )}
            >
              {checkRegularKey && editingName && (
                <NameEditor
                  initial={data.name}
                  onCancel={() => setEditingName(false)}
                  onSave={async (name) => {
                    await api.updateCheck(checkRegularKey, { name });
                    setEditingName(false);
                    check.reload();
                  }}
                />
              )}
              {checkRegularKey && editingTags && (
                <TagEditor
                  initial={tagList(data)}
                  suggestions={projectTags.data ?? []}
                  onCancel={() => setEditingTags(false)}
                  onSave={async (tags) => {
                    await api.updateCheck(checkRegularKey, { tags: tags.join(' ') });
                    setEditingTags(false);
                    check.reload();
                  }}
                />
              )}
            </CheckStatusCard>

            {/* 2. Status changes */}
            <StatusChanges flips={flips} now={now} />

            {/* 3. Ping log */}
            <Section id="pings" title="Ping log" count={pingsInRange?.length}>
              {pings.error && <ErrorBanner error={pings.error} onRetry={pings.reload} />}
              {pings.data === undefined && !pings.error && <p className="empty">Loading pings…</p>}
              {pings.data === null && (
                <p className="empty">Ping logs need a regular API key; this project uses a read-only key.</p>
              )}
              {pings.data && pings.data.length === 0 && <p className="empty">No pings yet.</p>}
              {pings.data && pings.data.length > 0 && (
                <p className="hint-text">Pings since {pingLogDaysText(project.pingLogDays)} ago</p>
              )}
              {pingsInRange && pings.data && pings.data.length > 0 && pingsInRange.length === 0 && (
                <p className="empty">No pings in the last {pingLogDaysText(project.pingLogDays)}.</p>
              )}
              {pingsInRange && pingsInRange.length > 0 && (
                <>
                  <ul className="list">
                    {pingsOnPage?.map((ping) => (
                      <li key={ping.n}>
                        <a className="ping-row" href={href({ name: 'ping', checkId, pingNumber: ping.n })}>
                          <span className={`ping-type ping-${ping.type}`}>{PING_LABEL[ping.type] ?? ping.type}</span>
                          <div className="check-main">
                            <div>{relative(ping.date, now)}{ping.duration != null && <> · took {durationShort(ping.duration)}</>}</div>
                            <div className="check-meta">{dateTime(ping.date, tz)} · #{ping.n}</div>
                          </div>
                          <ChevronIcon />
                        </a>
                      </li>
                    ))}
                  </ul>
                  {pingPageCount > 1 && (
                    <div className="icon-pager">
                      <button className="viewer-toggle viewer-icon-toggle" onClick={() => setPingPage(shownPingPage - 1)} disabled={shownPingPage === 0} aria-label="Previous page">
                        <ChevronLeftIcon />
                      </button>
                      <span className="icon-pager-range" aria-live="polite">Page {shownPingPage + 1} of {pingPageCount}</span>
                      <button className="viewer-toggle viewer-icon-toggle" onClick={() => setPingPage(shownPingPage + 1)} disabled={shownPingPage === pingPageCount - 1} aria-label="Next page">
                        <ChevronRightIcon />
                      </button>
                    </div>
                  )}
                </>
              )}
              {olderPingsInRangeGone && pings.data && (
                <p className="hint-text">
                  Pings before {dateTime(oldestKeptPing.date, tz)} aren't available: {HEALTHCHECKS_HOST} keeps only
                  the latest {pings.data.length} pings per check.
                </p>
              )}
            </Section>

            {/* 4. Everything else */}
            {checkRegularKey && (
              <section className="card card-spaced">
                <button className={`button${data.status === 'paused' ? '' : ' button-secondary'}`} onClick={togglePause} disabled={busy}>
                  {busy ? 'Working…' : data.status === 'paused' ? 'Resume monitoring' : 'Pause monitoring'}
                </button>
                <p className="hint-text">
                  {data.status === 'paused'
                    ? data.manual_resume
                      ? 'Paused: no alerts, and pings are ignored until you resume. Resuming resets it to New (clearing its last ping); it alerts again after its next ping.'
                      : 'Paused: no alerts. The next ping resumes monitoring. Resume resets it to New (clearing its last ping); it alerts again after its next ping.'
                    : 'Pausing stops alerts (e.g. during maintenance). ' +
                      (data.manual_resume ? 'It stays paused until you resume it.' : 'The next ping resumes it automatically.')}
                </p>
              </section>
            )}

            <h2 className="section-title section-title-row">
              On healthchecks.io <span className="project-chip">{project.name}</span>
            </h2>
            <div className="card card-links">
              {checkRegularKey ? (
                <ExternalLink url={webLinks.check(checkRegularKey)} detail="Edit check, schedule & integrations">
                  Open “{data.name || 'Unnamed check'}” in {project.name}
                </ExternalLink>
              ) : (
                <ExternalLink url={webLinks.dashboard} detail="Read-only key: opens the dashboard">
                  Open {project.name} dashboard
                </ExternalLink>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
