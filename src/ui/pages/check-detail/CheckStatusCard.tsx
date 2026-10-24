import type { ReactNode } from 'react';
import { dateTime, durationShort, percentText, relative, scheduleText, tagList, uptime } from '@/core/checks/format';
import type { Check, Flip } from '@/core/api/types';
import type { Project } from '@/core/projects/project';
import { StatusBadge } from '@/ui/components/StatusBadge';
import { EditIcon } from '@/ui/components/InterfaceIcons';
import { CheckIcon } from '@/ui/components/check-icon/CheckIcon';
import { useIcons } from '@/ui/state/checkIconsState';
import { useTimeZone } from '@/ui/state/timeZoneState';
import { href } from '@/ui/routes';

/** The check's status, then its details above its last ping. A screen that can change the check passes in Rename and
 *  Edit tags, and their editors as children, shown under the details. */
export function CheckStatusCard({ project, checkId, check, flips, now, renameButton, editTagsButton, children }: {
  project: Project;
  checkId: string;
  check: Check;
  flips: Flip[] | undefined; // undefined until they load: no uptime until then
  now: number;
  renameButton?: ReactNode;
  editTagsButton?: ReactNode;
  children?: ReactNode;
}) {
  const { iconForCheck } = useIcons();
  const { tz } = useTimeZone();
  const up = flips ? uptime(flips, check.status, now) : null;
  return (
    <section className="card">
      <div className="card-row">
        <a className="check-icon-edit" href={href({ name: 'icon', checkId })} aria-label="Change icon">
          <CheckIcon iconRef={iconForCheck(project.id, check)} size="lg" />
          <span className="check-icon-pencil" aria-hidden="true"><EditIcon /></span>
        </a>
        <StatusBadge status={check.status} />
        {check.started && <span className="running">running now</span>}
      </div>
      {check.desc && <p className="desc">{check.desc}</p>}
      <dl className="facts">
        <dt>Name</dt>
        <dd className="tags-inline">
          {check.name ? <span>{check.name}</span> : <span className="hint">none</span>}
          {renameButton}
        </dd>
        <dt>Schedule</dt><dd>{scheduleText(check)}</dd>
        <dt>Total pings</dt><dd>{check.n_pings.toLocaleString()}</dd>
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
          {tagList(check).length ? tagList(check).map((tag) => <span key={tag} className="tag-chip tag-chip-static">{tag}</span>) : <span className="hint">none</span>}
          {editTagsButton}
        </dd>
        <dt>Last ping</dt>
        {/* healthchecks.io's, not the ping log's newest: after a resume it's "never" until the next ping, as there. */}
        <dd>
          {check.last_ping ? relative(check.last_ping, now) : 'never'}
          {check.last_ping && <span className="fact-sub">{dateTime(check.last_ping, tz)}</span>}
        </dd>
        {check.next_ping && check.status !== 'paused' && (
          <>
            <dt>Next expected</dt>
            <dd>{new Date(check.next_ping).getTime() < now ? `overdue (was due ${relative(check.next_ping, now)})` : relative(check.next_ping, now)}</dd>
          </>
        )}
      </dl>
      {children}
    </section>
  );
}
