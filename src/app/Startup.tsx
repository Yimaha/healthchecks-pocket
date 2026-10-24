import { APP_NAME } from '@/core/app';
import { useReportLoading } from '@/ui/state/loadingState';

/** While saved projects load (on Android the first read after install also
 *  sets up the Keystore key, which can take a moment). Counts as loading,
 *  so the northern lights play. */
export function Startup() {
  useReportLoading(true);
  return (
    <main className="page startup" aria-busy="true">
      <img className="hero-icon" src="./icon-192.png" alt="" />
      <p role="status">Getting {APP_NAME} ready…</p>
    </main>
  );
}
