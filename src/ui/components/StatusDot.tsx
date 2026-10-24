import type { CheckStatus } from '@/core/api/types';

export function StatusDot({ status, started }: { status: CheckStatus; started?: boolean }) {
  return <span className={`dot dot-${status}${started ? ' dot-started' : ''}`} aria-hidden="true" />;
}
