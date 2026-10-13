import { useEffect, useMemo, useState } from 'react'
import type { HealthchecksApi } from '../core/api'
import { APP_NAME } from '../core/app'
import { timeZoneOptions } from '../core/timezones'
import { dateTime, relative, sortChecks, tagList } from '../core/format'
import { checkId, type Account, type CheckStatus } from '../core/types'
import { assignmentKey } from '../core/icons'
import { ErrorBanner, Header, RefreshButton, StatusDot } from './common'
import { useAsync, useAutoRefresh, useNow } from './hooks'
import { ChevronIcon, SettingsIcon } from './icons'
import { href } from './routes'
import { JobIcon } from './JobIcon'
import { useIcons } from './jobIcons'
import { useTimeZone } from './timezone'
import { UpdatePrompt } from './UpdatePrompt'

const SUMMARY: CheckStatus[] = ['down', 'grace', 'up', 'new', 'paused']

export function CheckList({ api, account, accounts, onSwitch }: {
  api: HealthchecksApi
  account: Account
  accounts: Account[]
  onSwitch: (id: string) => void
}) {
  const checks = useAsync(() => api.listChecks(), [api])
  const icons = useIcons()
  // Every check gets an icon (its default the first time); icons of checks
  // deleted on healthchecks.io are forgotten.
  useEffect(() => {
    if (icons.loaded && checks.data) icons.ensure(account.id, checks.data, true)
  }, [icons, checks.data, account.id])
  useAutoRefresh(checks.reload, 60_000)
  const now = useNow()
  const [tag, setTag] = useState<string | null>(null)
  const timeZone = useTimeZone()
  const tzOptions = useMemo(() => timeZoneOptions(), [])

  const sorted = useMemo(() => sortChecks(checks.data ?? []), [checks.data])
  const tags = useMemo(() => [...new Set(sorted.flatMap(tagList))].sort(), [sorted])
  const shown = tag ? sorted.filter((c) => tagList(c).includes(tag)) : sorted
  const counts = SUMMARY.map((s) => [s, sorted.filter((c) => c.status === s).length] as const).filter(([, n]) => n > 0)

  return (
    <>
      <Header
        title={APP_NAME}
        right={
          <>
            <RefreshButton loading={checks.loading} onClick={checks.reload} />
            <a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>
          </>
        }
      />
      <main className="page">
        <UpdatePrompt />
        <div className="project-bar">
          <span className="project-bar-label">Project</span>
          {accounts.length > 1 ? (
            <select className="project-picker" value={account.id} onChange={(e) => onSwitch(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          ) : (
            <span className="project-name">{account.name}</span>
          )}
        </div>
        <label className="project-bar tz-bar">
          <span className="project-bar-label">Time zone</span>
          <select className="tz-picker" value={timeZone.choice} onChange={(e) => timeZone.setChoice(e.target.value)}>
            {tzOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {checks.error && <ErrorBanner error={checks.error} onRetry={checks.reload} />}

        {checks.updatedAt && (
          <p className="updated">Updated {dateTime(new Date(checks.updatedAt).toISOString(), timeZone.tz, true)}</p>
        )}
        {counts.length > 0 && (
          <div className="summary">
            {counts.map(([status, n]) => (
              <span key={status} className={`summary-item summary-${status}`}>
                <StatusDot status={status} /> {n} {status === 'grace' ? 'late' : status}
              </span>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="tags" role="group" aria-label="Filter by tag">
            <button className={`tag${tag === null ? ' tag-active' : ''}`} onClick={() => setTag(null)}>All</button>
            {tags.map((t) => (
              <button key={t} className={`tag${tag === t ? ' tag-active' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        )}

        {checks.data && sorted.length === 0 && (
          <p className="empty">No checks in this project yet. Create them on healthchecks.io.</p>
        )}
        {!checks.data && checks.loading && <p className="empty">Loading checks…</p>}

        {shown.length > 0 && <ul className="list">
          {shown.map((c) => (
            <li key={checkId(c)}>
              <a className="check-row" href={href({ name: 'check', id: checkId(c) })}>
                <JobIcon iconRef={icons.assigned[assignmentKey(account.id, c)]} size="sm" status={c.status} started={c.started} />
                <div className="check-main">
                  <div className="check-name">{c.name || c.slug || 'Unnamed check'}</div>
                  <div className="check-meta">
                    {c.started && <span className="running">running · </span>}
                    {c.status === 'paused' ? 'paused' : `last ping ${relative(c.last_ping, now)}`}
                    {c.next_ping && c.status !== 'paused' && (
                      new Date(c.next_ping).getTime() < now
                        ? <> · overdue by {relative(c.next_ping, now).replace(' ago', '')}</>
                        : <> · next {relative(c.next_ping, now)}</>
                    )}
                  </div>
                </div>
                <ChevronIcon />
              </a>
            </li>
          ))}
        </ul>}
      </main>
    </>
  )
}
