import type { ReactNode } from 'react';
import { platform } from '@/platform';
import { ExternalIcon } from './InterfaceIcons';

export function ExternalLink({ url, children, detail }: { url: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <a
      className="row-link"
      href={url}
      onClick={(event) => { event.preventDefault(); platform.openExternal(url); }}
    >
      <span className="check-main">
        <span className="row-link-label">{children}</span>
        {detail && <span className="check-meta">{detail}</span>}
      </span>
      <ExternalIcon />
    </a>
  );
}
