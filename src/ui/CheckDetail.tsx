import { useEffect, useState } from 'react';
import { webLinks, type HealthchecksApi } from '../core/api';
import { assignmentKey } from '../core/icons';
import { dateTime, durationShort, percentText, relative, scheduleText, tagList, uptime } from '../core/format';
import type { Account, Flip, Ping } from '../core/types';
import { ErrorBanner, ExternalLink, Header, RefreshButton, Section, StatusBadge } from './common';
import { useAsync, useAutoRefresh, useNow } from './hooks';
import { ChevronIcon, EditIcon } from './icons';
import { CheckIcon } from './CheckIcon';
import { useIcons } from './checkIcons';
import { NameEditor } from './NameEditor';
import { TagEditor } from './TagEditor';
import { useTimeZone } from './timezone';
import { href } from './routes';

const PINGS_SHOWN = 20;

const PING_LABEL: Record<string, string> = {
  success: 'OK', start: 'Started', fail: 'Failure', log: 'Log', ign: 'Ignored',
};

export function CheckDetail({ api, account, id }: { api: HealthchecksApi; account: Account; id: string }) {
  const check = useAsync(() => api.getCheck(id), [api, id]);
  const icons = useIcons();
  useEffect(() => {
    if (icons.loaded && check.data) icons.ensure(account.id, [check.data]);
  }, [icons, check.data, account.id]);
  const uuid = check.data?.uuid;
  // Ping logs need a regular key: read-only checks have no uuid. null = read-only,
  // undefined = check not loaded yet.
  const readOnly = !!check.data && !uuid;
  const pings = useAsync<Ping[] | null | undefined>(
    () => (uuid ? api.listPings(uuid) : Promise.resolve(readOnly ? null : undefined)),
    [api, uuid, readOnly],
  );
  const flips = useAsync<Flip[]>(() => api.listFlips(id, 30 * 86400), [api, id]);
  const now = useNow();
  const { tz } = useTimeZone();
  const [busy, setBusy] = useState(false);
  const [showAllPings, setShowAllPings] = useState(false);
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
  useAutoRefresh(reload, 60_000);

  async function togglePause() {
    if (!uuid || !check.data) return;
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
      await (pausing ? api.pause(uuid) : api.resume(uuid));
      reload();
    } catch (error) {
      setActionError(error as Error);
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
                <a className="check-icon-edit" href={href({ name: 'icon', id })} aria-label="Change icon">
                  <CheckIcon iconRef={icons.assigned[assignmentKey(account.id, id)]} size="lg" />
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
                  {uuid && !editingName && (
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
                  {uuid && !editingTags && (
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
              {uuid && editingName && (
                <NameEditor
                  initial={data.name}
                  onCancel={() => setEditingName(false)}
                  onSave={async (name) => {
                    await api.updateCheck(uuid, { name });
                    setEditingName(false);
                    check.reload();
                  }}
                />
              )}
              {uuid && editingTags && (
                <TagEditor
                  initial={tagList(data)}
                  suggestions={projectTags.data ?? []}
                  onCancel={() => setEditingTags(false)}
                  onSave={async (tags) => {
                    await api.updateCheck(uuid, { tags: tags.join(' ') });
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
                  {[...flips.data].sort((first, second) => second.timestamp.localeCompare(first.timestamp)).map((flip) => (
                    <li key={flip.timestamp} className="flip-row">
                      <span className={`flip flip-${flip.up ? 'up' : 'down'}`}>{flip.up ? 'Went up' : 'Down or paused'}</span>
                      <span className="check-meta">{relative(flip.timestamp, now)} · {dateTime(flip.timestamp, tz)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* 3. Ping log */}
            <Section id="pings" title="Ping log" count={pings.data?.length}>
              {pings.error && <ErrorBanner error={pings.error} onRetry={pings.reload} />}
              {pings.data === undefined && !pings.error && <p className="empty">Loading pings…</p>}
              {pings.data === null && (
                <p className="empty">Ping logs need a regular API key; this project uses a read-only key.</p>
              )}
              {pings.data && pings.data.length === 0 && <p className="empty">No pings yet.</p>}
              {pings.data && pings.data.length > 0 && (
                <>
                  <ul className="list">
                    {(showAllPings ? pings.data : pings.data.slice(0, PINGS_SHOWN)).map((ping) => (
                      <li key={ping.n}>
                        <a className="ping-row" href={href({ name: 'ping', id, pingNumber: ping.n })}>
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
                  {pings.data.length > PINGS_SHOWN && (
                    <button className="link-button show-more" onClick={() => setShowAllPings(!showAllPings)}>
                      {showAllPings ? `Show latest ${PINGS_SHOWN}` : `Show all ${pings.data.length}`}
                    </button>
                  )}
                </>
              )}
            </Section>

            {/* 4. Everything else */}
            {uuid && (
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
              On healthchecks.io <span className="project-chip">{account.name}</span>
            </h2>
            <div className="card card-links">
              {uuid ? (
                <ExternalLink url={webLinks.check(account.baseUrl, uuid)} detail="Edit check, schedule & integrations">
                  Open “{data.name || data.slug}” in {account.name}
                </ExternalLink>
              ) : (
                <ExternalLink url={webLinks.dashboard(account.baseUrl)} detail="Read-only key: opens the dashboard">
                  Open {account.name} dashboard
                </ExternalLink>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
