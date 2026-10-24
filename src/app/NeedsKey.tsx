import type { Project } from '@/core/api/types';
import { APP_NAME } from '@/core/app';
import { Header } from '@/ui/components/Header';
import { SettingsIcon } from '@/ui/components/InterfaceIcons';
import { href } from '@/ui/routes';

/** The open project has no API key on this device (e.g. after moving to a
 *  new phone: projects come along, keys don't). */
export function NeedsKey({ project, onTryAgain }: { project: Project; onTryAgain: () => void }) {
  if (project.apiKeyUnreadable) {
    return (
      <>
        <Header
          title={APP_NAME}
          right={<a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>}
        />
        <main className="page">
          <section className="card">
            <h2 className="card-title">Couldn't read the API key for {project.name}</h2>
            <p className="desc">
              The key is still saved on this phone, but its secure storage didn't give it back just now. Try again; if
              that keeps failing, restart the phone, or paste the key again.
            </p>
            <button className="button" onClick={onTryAgain}>Try again</button>
            <a className="link-button" href={href({ name: 'project', projectId: project.id })}>Paste the key again</a>
          </section>
        </main>
      </>
    );
  }
  return (
    <>
      <Header
        title={APP_NAME}
        right={<a className="icon-button" href={href({ name: 'settings' })} aria-label="Settings"><SettingsIcon /></a>}
      />
      <main className="page">
        <section className="card">
          <h2 className="card-title">Add the API key for {project.name}</h2>
          <p className="desc">
            API keys stay on the phone they were added on, so this project's key needs pasting again here. Other
            projects are in Settings.
          </p>
          <a className="button" href={href({ name: 'project', projectId: project.id })}>Add API key</a>
        </section>
      </main>
    </>
  );
}
