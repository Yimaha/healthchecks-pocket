import type { ReactNode } from 'react';
import { Header } from './Header';

/** In place of a page the app can't show: the page's header, whose back arrow is the way back, and a short warning
 *  saying why. */
export function WarningPage({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  return (
    <>
      <Header title={title} back={back} />
      <main className="page">
        <div className="notice notice-warn" role="note"><p>{children}</p></div>
      </main>
    </>
  );
}
