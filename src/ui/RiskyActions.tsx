import { useState, type ReactNode } from 'react';
import type { Project } from '@/core/api/types';
import { ErrorBanner, Header } from './common';
import { href } from './routes';

/** Settings > Risky actions: things that delete data on this device, for
 *  starting over (or testing what a new phone or a first launch looks like).
 *  Each first shows what will happen and does nothing until confirmed. Last,
 *  Debug: simulated crashes for checking the error screens, which delete nothing. */
export function RiskyActions({ projects, onRemoveProjects, onReset, onRestartFailingToLoad }: {
  projects: Project[];
  onRemoveProjects: () => Promise<void>;
  onReset: () => Promise<void>;
  onRestartFailingToLoad: () => Promise<void>;
}) {
  const [asking, setAsking] = useState<'projects' | 'reset'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [simulatedCrashRequested, setSimulatedCrashRequested] = useState(false);
  const projectCount = projects.length;
  // Thrown while drawing, as a real bug would be, so the error boundary catches it.
  if (simulatedCrashRequested) {
    throw new Error('Simulated crash: this screen threw while drawing (Risky actions > Debug).');
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setAsking(undefined);
    } catch (actionError) {
      setError(actionError as Error);
    } finally {
      setBusy(false);
    }
  }
  const ask = (which: 'projects' | 'reset') => {
    setError(undefined);
    setAsking(which);
  };

  return (
    <>
      <Header title="Risky actions" back={href({ name: 'settings' })} />
      <main className="page">
        <p className="desc">These delete data saved on this device and can't be undone.</p>
        {error && <ErrorBanner error={error} />}

        <section className="card card-spaced">
          <h2 className="card-title">Remove all projects</h2>
          <p className="desc">
            Removes every project from this device, together with its API key. Your settings stay.
          </p>
          {asking === 'projects' ? (
            <Warning
              title="Remove all projects?"
              confirm="Remove all projects"
              busy={busy}
              onConfirm={() => run(onRemoveProjects)}
              onCancel={() => setAsking(undefined)}
            >
              <li>{projectCount === 1 ? 'Your project is' : `All ${projectCount} projects are`} removed from this device, with {projectCount === 1 ? 'its API key' : 'their API keys'}.</li>
              <li>Your settings stay: appearance, time zone, ping log view, API key protection and update checks.</li>
              <li>The check list is empty until you add a project again in Settings.</li>
            </Warning>
          ) : (
            <button className="button button-danger" disabled={busy || projectCount === 0} onClick={() => ask('projects')}>
              Remove all projects
            </button>
          )}
        </section>

        <section className="card card-spaced">
          <h2 className="card-title">Reset the app</h2>
          <p className="desc">
            Deletes everything this app saved on this device and starts it again as if just installed.
          </p>
          {asking === 'reset' ? (
            <Warning
              title="Reset the app?"
              confirm="Reset and start over"
              busy={busy}
              onConfirm={() => run(onReset)}
              onCancel={() => setAsking(undefined)}
            >
              <li>Every project and API key on this device is deleted.</li>
              <li>All settings go back to their defaults: appearance, time zone, ping log view, API key protection and update checks.</li>
              <li>The app restarts at the first-launch setup. You go through it again, then add your projects and paste their API keys.</li>
            </Warning>
          ) : (
            <button className="button button-danger" disabled={busy} onClick={() => ask('reset')}>
              Reset the app
            </button>
          )}
        </section>

        <section className="card card-spaced">
          <h2 className="card-title">Debug: simulate a crash</h2>
          <p className="desc">
            Shows the error screens, to check they work on this device. Nothing saved is changed.
          </p>
          <button className="button button-secondary" disabled={busy} onClick={() => setSimulatedCrashRequested(true)}>
            Crash this screen
          </button>
          <button className="button button-secondary" disabled={busy} onClick={() => run(onRestartFailingToLoad)}>
            Restart and fail to load projects
          </button>
        </section>
      </main>
    </>
  );
}

/** What an action will do, with Confirm and Cancel. */
function Warning({ title, confirm, busy, onConfirm, onCancel, children }: {
  title: string;
  confirm: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="warning" role="alertdialog" aria-label={title}>
      <p className="warning-title">{title} This happens:</p>
      <ul>{children}</ul>
      <button className="button button-danger-solid" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirm}</button>
      <button className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  );
}
