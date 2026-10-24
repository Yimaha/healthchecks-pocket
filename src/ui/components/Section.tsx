import type { ReactNode } from 'react';
import { useStoredFlag } from '@/ui/hooks/useStored';
import { ChevronIcon } from './InterfaceIcons';

/** Section with a tappable title that folds its content. The open/closed
 *  state is remembered per section on this device. */
export function Section({ id, title, count, children }: {
  id: string;
  title: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useStoredFlag(`section.${id}`, true);
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
