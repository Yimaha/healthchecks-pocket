import type { CheckStatus } from '@/core/api/types';
import { STATUS_LABEL } from '@/core/checks/format';

export function StatusBadge({ status }: { status: CheckStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
