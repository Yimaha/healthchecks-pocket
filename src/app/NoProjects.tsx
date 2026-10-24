import { APP_NAME } from '@/core/app';
import { Header } from '@/ui/components/common';
import { SettingsIcon } from '@/ui/components/InterfaceIcons';
import { href } from '@/ui/routes';

/** No projects on this device any more (all removed): the empty list, with a
 *  big hint pointing at Settings, where projects are added. */
export function NoProjects() {
  return (
    <>
      <Header
        title={APP_NAME}
        right={<a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>}
      />
      <main className="page no-projects">
        <svg className="no-projects-arrow" viewBox="0 0 200 120" preserveAspectRatio="xMaxYMin meet" aria-hidden="true">
          <path d="M14 112 C 120 112, 172 76, 182 14" />
          <path d="M168 30 L 182 12 L 194 32" />
        </svg>
        <p className="no-projects-title">Set up a project in Settings</p>
        <p className="no-projects-text">
          Tap <SettingsIcon /> up here, then <strong>Add project</strong>, to see your checks. No account yet? Try the demo
          there.
        </p>
      </main>
    </>
  );
}
