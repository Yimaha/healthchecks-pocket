import { Component, useState, type ReactNode } from 'react';
import { ErrorBanner } from './common';

/** The app can't go on: what happened, with Try again and, as the way out
 *  when saved data is what breaks it, Reset the app. */
export function AppError({ title, error, onTryAgain, onReset }: {
  title: string;
  error: Error;
  onTryAgain: () => void;
  onReset: () => Promise<void>;
}) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<Error>();

  async function confirmAndReset() {
    if (!confirm('Reset the app? Every project, API key and setting on this device is deleted, and the app starts again as if just installed.')) return;
    setResetting(true);
    setResetError(undefined);
    try {
      await onReset();
    } catch (clearError) {
      setResetError(clearError as Error);
      setResetting(false);
    }
  }

  return (
    <main className="page startup">
      <img className="hero-icon" src="./icon-192.png" alt="" />
      <div role="alert">
        <p><strong>{title}</strong></p>
        <p>{error.message}</p>
      </div>
      {resetError && <ErrorBanner error={resetError} />}
      <button className="button" disabled={resetting} onClick={onTryAgain}>Try again</button>
      <button className="button button-danger" disabled={resetting} onClick={confirmAndReset}>
        {resetting ? 'Resetting…' : 'Reset the app'}
      </button>
    </main>
  );
}

/** Catches a screen that throws while rendering (e.g. on damaged saved data),
 *  which would otherwise unmount the whole app and leave a blank page. */
export class AppErrorBoundary extends Component<
  { children: ReactNode; onTryAgain: () => void; onReset: () => Promise<void> },
  { renderError?: Error }
> {
  state: { renderError?: Error } = {};

  static getDerivedStateFromError(thrown: unknown) {
    return { renderError: thrown instanceof Error ? thrown : new Error(String(thrown)) };
  }

  render() {
    const { renderError } = this.state;
    if (!renderError) return this.props.children;
    return <AppError title="Something went wrong" error={renderError} onTryAgain={this.props.onTryAgain} onReset={this.props.onReset} />;
  }
}
