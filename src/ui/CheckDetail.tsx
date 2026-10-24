import { useState } from 'react';
import { ApiError, webLinks, type HealthchecksApi } from '../core/api';
import { dateTime, durationShort, percentText, relative, scheduleText, tagList, uptime } from '../core/format';
import { pingLogDaysText, pingLogRangeStart } from '../core/pingLogRange';
import type { Flip, Ping, Project } from '../core/types';
import { ErrorBanner, ExternalLink, Header, RefreshButton, Section, StatusBadge } from './common';
import { useAsync, useAutoRefresh, useNow } from './hooks';
import { ChevronIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon } from './icons';
import { CheckIcon } from './CheckIcon';
import { useIcons } from './checkIcons';
import { NameEditor } from './NameEditor';
import { TagEditor } from './TagEditor';
import { useTimeZone } from './timezone';
import { href } from './routes';

const PINGS_PER_PAGE = 40; // well under the 100 pings healthchecks.io's free plan keeps, so its log pages too

const PING_LABEL: Record<string, string> = {
  success: 'OK', start: 'Started', fail: 'Failure', log: 'Log', ign: 'Ignored',
};

export function CheckDetail({ api, project, checkId }: { api: HealthchecksApi; project: Project; checkId: string }) {
  const check = useAsync(() => api.getCheck(checkId), [api, checkId]);
  const { iconForCheck } = useIcons();
  const checkUuid = check.data?.uuid;
  // Ping logs need a regular key: read-only checks have no uuid. null = read-only,
  // undefined = check not loaded yet.
  const readOnly = !!check.data && !checkUuid;
  const pings = useAsync<Ping[] | null | undefined>(
    () => (checkUuid ? api.listPings(checkUuid) : Promise.resolve(readOnly ? null : undefined)),
    [api, checkUuid, readOnly],
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
  // Resuming a paused check clears last_ping on healthchecks.io (it starts
  // over as New), but the ping log keeps the history.
  const lastPing = check.data?.last_ping ?? pings.data?.[0]?.date ?? null;
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
    if (!checkUuid || !check.data) return;
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
      await (pausing ? api.pause(checkUuid) : api.resume(checkUuid));
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
  const up = data && flips.data ? uptime(flips.data, data.status, now) : null;
  return (
    <>
      <Header
        title={data?.name || data?.slug || 'Check'}
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
            <section className="card">
              <div className="card-row">
                <a className="check-icon-edit" href={href({ name: 'icon', checkId })} aria-label="Change icon">
                  <CheckIcon iconRef={iconForCheck(project.id, data)} size="lg" />
                  <span className="check-icon-pencil" aria-hidden="true"><EditIcon /></span>
                </a>
                <StatusBadge status={data.status} />
                {data.started && <span className="running">running now</span>}
              </div>
              {data.desc && <p className="desc">{data.desc}</p>}
              <dl className="facts">
                <dt>Name</dt>
                <dd className="tags-inline">
                  {data.name ? <span>{data.name}</span> : <span className="hint">none</span>}
                  {checkUuid && !editingName && (
                    <button className="link-button tag-edit-link" onClick={() => setEditingName(true)}>Rename</button>
                  )}
                </dd>
                <dt>Schedule</dt><dd>{scheduleText(data)}</dd>
                <dt>Total pings</dt><dd>{data.n_pings.toLocaleString()}</dd>
                {up && (
                  <>
                    <dt>Uptime</dt>
                    <dd>
                      {percentText(up.percent)}
                      <span className="fact-sub">
                        {up.since ? `since ${dateTime(up.since, tz)}` : 'last 30 days'}
                        {' · '}
                        {up.downSeconds ? `down ${durationShort(up.downSeconds)}` : 'no downtime'}
                      </span>
                    </dd>
                  </>
                )}
                <dt>Tags</dt>
                <dd className="tags-inline">
                  {tagList(data).length ? tagList(data).map((tag) => <span key={tag} className="tag-chip tag-chip-static">{tag}</span>) : <span className="hint">none</span>}
                  {checkUuid && !editingTags && (
                    <button className="link-button tag-edit-link" onClick={() => setEditingTags(true)}>Edit tags</button>
                  )}
                </dd>
                <dt>Last ping</dt>
                <dd>
                  {lastPing ? relative(lastPing, now) : 'never'}
                  {lastPing && (
                    <span className="fact-sub">
                      {dateTime(lastPing, tz)}
                      {!data.last_ping && ' · from the ping log (cleared when monitoring resumed)'}
                    </span>
                  )}
                </dd>
                {data.next_ping && data.status !== 'paused' && (
                  <>
                    <dt>Next expected</dt>
                    <dd>{new Date(data.next_ping).getTime() < now ? `overdue (was due ${relative(data.next_ping, now)})` : relative(data.next_ping, now)}</dd>
                  </>
                )}
              </dl>
              {checkUuid && editingName && (
                <NameEditor
                  initial={data.name}
                  onCancel={() => setEditingName(false)}
                  onSave={async (name) => {
                    await api.updateCheck(checkUuid, { name });
                    setEditingName(false);
                    check.reload();
                  }}
                />
              )}
              {checkUuid && editingTags && (
                <TagEditor
                  initial={tagList(data)}
                  suggestions={projectTags.data ?? []}
                  onCancel={() => setEditingTags(false)}
                  onSave={async (tags) => {
                    await api.updateCheck(checkUuid, { tags: tags.join(' ') });
                    setEditingTags(false);
                    check.reload();
                  }}
                />
              )}
            </section>

            {/* 2. Status changes */}
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
                  Pings before {dateTime(oldestKeptPing.date, tz)} aren't available: {new URL(project.baseUrl).host} keeps only
                  the latest {pings.data.length} pings per check.
                </p>
              )}
            </Section>

            {/* 4. Everything else */}
            {checkUuid && (
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
              {checkUuid ? (
                <ExternalLink url={webLinks.check(project.baseUrl, checkUuid)} detail="Edit check, schedule & integrations">
                  Open “{data.name || data.slug}” in {project.name}
                </ExternalLink>
              ) : (
                <ExternalLink url={webLinks.dashboard(project.baseUrl)} detail="Read-only key: opens the dashboard">
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

/** Each status change with a React key for its row: its time, numbered when several changes share that time (healthchecks.io records them to the second). */
function withStatusChangeRowKeys(sortedFlips: Flip[]): { flip: Flip; statusChangeRowKey: string }[] {
  const flipCountByTimestamp = new Map<string, number>();
  return sortedFlips.map((flip) => {
    const earlierFlipsAtTimestamp = flipCountByTimestamp.get(flip.timestamp) ?? 0;
    flipCountByTimestamp.set(flip.timestamp, earlierFlipsAtTimestamp + 1);
    return { flip, statusChangeRowKey: `${flip.timestamp}#${earlierFlipsAtTimestamp}` };
  });
}
