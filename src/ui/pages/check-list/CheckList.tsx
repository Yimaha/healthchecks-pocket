import { useEffect, useMemo, useState } from 'react';
import type { HealthchecksApi } from '@/core/api/client';
import { APP_NAME } from '@/core/app';
import { timeZoneOptions } from '@/core/preferences/timezones';
import { dateTime, relative, sortChecks, tagList } from '@/core/checks/format';
import { checkIdOf, type CheckStatus, type Project } from '@/core/api/types';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { Header } from '@/ui/components/Header';
import { RefreshButton } from '@/ui/components/RefreshButton';
import { StatusDot } from '@/ui/components/StatusDot';
import { useAsync } from '@/ui/hooks/useAsync';
import { useAutoRefresh } from '@/ui/hooks/useAutoRefresh';
import { useNow } from '@/ui/hooks/useNow';
import { ChevronIcon, SettingsIcon } from '@/ui/components/InterfaceIcons';
import { href } from '@/ui/routes';
import { CheckIcon } from '@/ui/components/check-icon/CheckIcon';
import { useIcons } from '@/ui/state/checkIconsState';
import { useTimeZone } from '@/ui/state/timeZoneState';
import { UpdatePrompt } from '@/ui/components/UpdatePrompt';

const SUMMARY: CheckStatus[] = ['down', 'grace', 'up', 'new', 'paused'];

export function CheckList({ api, project, projects, onSwitchProject }: {
  api: HealthchecksApi;
  project: Project;
  projects: Project[];
  onSwitchProject: (projectId: string) => void;
}) {
  // The project id travels with its list, so icons only ever go to that project's checks.
  const checks = useAsync(async () => ({ projectId: project.id, projectChecks: await api.listChecks() }), [api, project.id]);
  const { loaded: iconsLoaded, assignIconsToNewChecks, iconForCheck } = useIcons();
  // Checks seen for the first time get their default icon.
  useEffect(() => {
    if (iconsLoaded && checks.data) assignIconsToNewChecks(checks.data.projectId, checks.data.projectChecks);
  }, [iconsLoaded, assignIconsToNewChecks, checks.data]);
  useAutoRefresh(checks.reload, 60_000, checks.loading);
  const now = useNow();
  const [tag, setTag] = useState<string | null>(null);
  const timeZone = useTimeZone();
  const tzOptions = useMemo(() => timeZoneOptions(), []);

  const sorted = useMemo(() => sortChecks(checks.data?.projectChecks ?? []), [checks.data]);
  const tags = useMemo(() => [...new Set(sorted.flatMap(tagList))].sort(), [sorted]);
  const shown = tag ? sorted.filter((check) => tagList(check).includes(tag)) : sorted;
  const counts = SUMMARY.map((status) => [status, sorted.filter((check) => check.status === status).length] as const).filter(([, count]) => count > 0);

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
          {projects.length > 1 ? (
            <select className="project-picker" value={project.id} onChange={(event) => onSwitchProject(event.target.value)}>
              {projects.map((projectOption) => <option key={projectOption.id} value={projectOption.id}>{projectOption.name}</option>)}
            </select>
          ) : (
            <span className="project-name">{project.name}</span>
          )}
        </div>
        <label className="project-bar tz-bar">
          <span className="project-bar-label">Time zone</span>
          <select className="tz-picker" value={timeZone.choice} onChange={(event) => timeZone.setChoice(event.target.value)}>
            {tzOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {checks.error && <ErrorBanner error={checks.error} onRetry={checks.reload} />}

        {checks.updatedAt && (
          <p className="updated">Updated {dateTime(new Date(checks.updatedAt).toISOString(), timeZone.tz, true)}</p>
        )}
        {counts.length > 0 && (
          <div className="summary">
            {counts.map(([status, count]) => (
              <span key={status} className={`summary-item summary-${status}`}>
                <StatusDot status={status} /> {count} {status === 'grace' ? 'late' : status}
              </span>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="tags" role="group" aria-label="Filter by tag">
            <button className={`tag${tag === null ? ' tag-active' : ''}`} onClick={() => setTag(null)}>All</button>
            {tags.map((tagName) => (
              <button key={tagName} className={`tag${tag === tagName ? ' tag-active' : ''}`} onClick={() => setTag(tag === tagName ? null : tagName)}>
                {tagName}
              </button>
            ))}
          </div>
        )}

        {checks.data && sorted.length === 0 && (
          <p className="empty">No checks in this project yet. Create them on healthchecks.io.</p>
        )}
        {!checks.data && checks.loading && <p className="empty">Loading checks…</p>}

        {shown.length > 0 && <ul className="list">
          {shown.map((check) => (
            <li key={checkIdOf(check)}>
              <a className="check-row" href={href({ name: 'check', checkId: checkIdOf(check) })}>
                <CheckIcon iconRef={iconForCheck(project.id, check)} size="sm" status={check.status} started={check.started} />
                <div className="check-main">
                  <div className="check-name">{check.name || 'Unnamed check'}</div>
                  <div className="check-meta">
                    {check.started && <span className="running">running · </span>}
                    {check.status === 'paused' ? 'paused' : `last ping ${relative(check.last_ping, now)}`}
                    {check.next_ping && check.status !== 'paused' && (
                      new Date(check.next_ping).getTime() < now
                        ? <> · overdue by {relative(check.next_ping, now).replace(' ago', '')}</>
                        : <> · next {relative(check.next_ping, now)}</>
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
  );
}
