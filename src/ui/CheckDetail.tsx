import { useState } from 'react'
import { webLinks, type HealthchecksApi } from '../core/api'
import { dateTime, durationShort, percentText, relative, scheduleText, tagList, uptime } from '../core/format'
import type { Account, Flip, Ping } from '../core/types'
import { ErrorBanner, ExternalLink, Header, RefreshButton, Section, StatusBadge } from './common'
import { useAsync, useAutoRefresh, useNow } from './hooks'
import { ChevronIcon } from './icons'
import { TagEditor } from './TagEditor'
import { useTimeZone } from './timezone'
import { href } from './routes'

const PINGS_SHOWN = 20

const PING_LABEL: Record<string, string> = {
  success: 'OK', start: 'Started', fail: 'Failure', log: 'Log', ign: 'Ignored',
}

export function CheckDetail({ api, account, id }: { api: HealthchecksApi; account: Account; id: string }) {
  const check = useAsync(() => api.getCheck(id), [api, id])
  const uuid = check.data?.uuid
  // Ping logs need a regular key: read-only checks have no uuid. null = read-only,
  // undefined = check not loaded yet.
  const readOnly = !!check.data && !uuid
  const pings = useAsync<Ping[] | null | undefined>(
    () => (uuid ? api.listPings(uuid) : Promise.resolve(readOnly ? null : undefined)),
    [api, uuid, readOnly],
  )
  const flips = useAsync<Flip[]>(() => api.listFlips(id, 30 * 86400), [api, id])
  const now = useNow()
  const { tz } = useTimeZone()
  const [busy, setBusy] = useState(false)
  const [showAllPings, setShowAllPings] = useState(false)
  const [editingTags, setEditingTags] = useState(false)
  // Suggestions for the tag editor: every tag used in this project.
  const projectTags = useAsync<string[]>(
    async () => (editingTags ? [...new Set((await api.listChecks()).flatMap(tagList))].sort() : []),
    [api, editingTags],
  )
  const [actionError, setActionError] = useState<Error>()

  const reload = () => { check.reload(); pings.reload(); flips.reload() }
  // Resuming a paused check clears last_ping on healthchecks.io (it starts
  // over as New), but the ping log keeps the history.
  const lastPing = check.data?.last_ping ?? pings.data?.[0]?.date ?? null
  useAutoRefresh(reload, 60_000)

  async function togglePause() {
    if (!uuid || !check.data) return
    const pausing = check.data.status !== 'paused'
    const until = check.data.manual_resume ? 'you resume it here' : 'its next ping (or you resume it here)'
    const question = pausing
      ? `Pause "${check.data.name}"? It won't send alerts until ${until}.`
      // Resume can't be undone: healthchecks.io resets the check to New and
      // clears its last ping, so ask first (the button sits where Pause was).
      : `Resume "${check.data.name}"? It goes back to New, its last ping is cleared, and it alerts again after its next ping.`
    if (!confirm(question)) return
    setBusy(true)
    setActionError(undefined)
    try {
      await (pausing ? api.pause(uuid) : api.resume(uuid))
      reload()
    } catch (e) {
      setActionError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  const c = check.data
  const up = c && flips.data ? uptime(flips.data, c.status, now) : null
  return (
    <>
      <Header
        title={c?.name || c?.slug || 'Check'}
        back={href({ name: 'list' })}
        right={<RefreshButton loading={check.loading} onClick={reload} />}
      />
      <main className="page">
        {check.error && <ErrorBanner error={check.error} onRetry={reload} />}
        {actionError && <ErrorBanner error={actionError} />}
        {!c && check.loading && <p className="empty">Loading…</p>}

        {c && (
          <>
            {/* 1. Status, with the check's details above its last ping */}
            <section className="card">
              <div className="card-row">
                <StatusBadge status={c.status} />
                {c.started && <span className="running">running now</span>}
              </div>
              {c.desc && <p className="desc">{c.desc}</p>}
              <dl className="facts">
                <dt>Schedule</dt><dd>{scheduleText(c)}</dd>
                <dt>Total pings</dt><dd>{c.n_pings.toLocaleString()}</dd>
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
                  {tagList(c).length ? tagList(c).map((t) => <span key={t} className="tag-chip tag-chip-static">{t}</span>) : <span className="hint">none</span>}
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
                      {!c.last_ping && ' · from the ping log (cleared when monitoring resumed)'}
                    </span>
                  )}
                </dd>
                {c.next_ping && c.status !== 'paused' && (
                  <>
                    <dt>Next expected</dt>
                    <dd>{new Date(c.next_ping).getTime() < now ? `overdue (was due ${relative(c.next_ping, now)})` : relative(c.next_ping, now)}</dd>
                  </>
                )}
              </dl>
              {uuid && editingTags && (
                <TagEditor
                  initial={tagList(c)}
                  suggestions={projectTags.data ?? []}
                  onCancel={() => setEditingTags(false)}
                  onSave={async (tags) => {
                    await api.updateCheck(uuid, { tags: tags.join(' ') })
                    setEditingTags(false)
                    check.reload()
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
                  {[...flips.data].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((f) => (
                    <li key={f.timestamp} className="flip-row">
                      <span className={`flip flip-${f.up ? 'up' : 'down'}`}>{f.up ? 'Went up' : 'Down or paused'}</span>
                      <span className="check-meta">{relative(f.timestamp, now)} · {dateTime(f.timestamp, tz)}</span>
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
                    {(showAllPings ? pings.data : pings.data.slice(0, PINGS_SHOWN)).map((p) => (
                      <li key={p.n}>
                        <a className="ping-row" href={href({ name: 'ping', id, n: p.n })}>
                          <span className={`ping-type ping-${p.type}`}>{PING_LABEL[p.type] ?? p.type}</span>
                          <div className="check-main">
                            <div>{relative(p.date, now)}{p.duration != null && <> · took {durationShort(p.duration)}</>}</div>
                            <div className="check-meta">{dateTime(p.date, tz)} · #{p.n}</div>
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
                <button className={`button${c.status === 'paused' ? '' : ' button-secondary'}`} onClick={togglePause} disabled={busy}>
                  {busy ? 'Working…' : c.status === 'paused' ? 'Resume monitoring' : 'Pause monitoring'}
                </button>
                <p className="hint-text">
                  {c.status === 'paused'
                    ? c.manual_resume
                      ? 'Paused: no alerts, and pings are ignored until you resume. Resuming resets it to New (clearing its last ping); it alerts again after its next ping.'
                      : 'Paused: no alerts. The next ping resumes monitoring. Resume resets it to New (clearing its last ping); it alerts again after its next ping.'
                    : 'Pausing stops alerts (e.g. during maintenance). ' +
                      (c.manual_resume ? 'It stays paused until you resume it.' : 'The next ping resumes it automatically.')}
                </p>
              </section>
            )}

            <h2 className="section-title section-title-row">
              On healthchecks.io <span className="project-chip">{account.name}</span>
            </h2>
            <div className="card card-links">
              {uuid ? (
                <ExternalLink url={webLinks.check(account.baseUrl, uuid)} detail="Edit check, schedule & integrations">
                  Open “{c.name || c.slug}” in {account.name}
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
  )
}
