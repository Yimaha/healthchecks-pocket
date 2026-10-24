import type { ReactNode } from 'react';
import { BackIcon } from './InterfaceIcons';
import { goBackTo, parseRoute } from '@/ui/routes';

export function Header({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="header">
      {back ? (
        <a
          className="header-back"
          href={back}
          aria-label="Back"
          onClick={(event) => { event.preventDefault(); goBackTo(parseRoute(back)); }}
        >
          <BackIcon />
        </a>
      ) : <span className="header-spacer" />}
      <h1 className="header-title">{title}</h1>
      <div className="header-right">{right}</div>
    </header>
  );
}
