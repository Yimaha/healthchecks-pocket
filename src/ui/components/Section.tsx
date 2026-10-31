import type { ReactNode } from 'react';
import type { FoldingSectionId } from '@/core/app-settings/versions/appSettingsV1';
import { useAppSettings } from '@/ui/state/appSettingsState';
import { ChevronIcon } from './InterfaceIcons';

/** Section with a tappable title that folds its content. The open/closed
 *  state is remembered per section on this device. */
export function Section({ id, title, count, children }: {
  id: FoldingSectionId;
  title: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  const { appSettings, changeAppSettings } = useAppSettings();
  const open = appSettings.openSections[id];
  const setOpen = (sectionOpen: boolean) => changeAppSettings({ openSections: { ...appSettings.openSections, [id]: sectionOpen } });
  return (
    <section>
      <button className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="section-title-text">
          {title}
          {count != null && <span className="section-count">{count}</span>}
        </span>
        <span className={`section-chevron${open ? ' open' : ''}`}><ChevronIcon /></span>
      </button>
      {open && children}
    </section>
  );
}
