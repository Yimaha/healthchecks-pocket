import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { APP_NAME } from '@/core/app';
import { buildCrashLog } from '@/core/crashLog';
import { platform } from '@/platform';
import { ErrorBanner } from './common';
import { parseRoute } from './routes';

/** The app can't go on: what happened, with Try again and, as the way out
 *  when saved data is what breaks it, Reset the app. Below them, the crash
 *  log for a bug report. */
export function AppError({ title, error, componentStack, onTryAgain, onReset }: {
  title: string;
  error: Error;
  componentStack?: string;
  onTryAgain: () => void;
  onReset: () => Promise<void>;
}) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<Error>();
  // Taken when the error screen first shows, so they describe the crash, not a later redraw.
  const [occurredAt] = useState(() => new Date());
  const [screenName] = useState(() => parseRoute(location.hash).name);
  const crashLog = useMemo(
    () => buildCrashLog({ whatFailed: title, error, componentStack, screenName, occurredAt, userAgent: navigator.userAgent }),
    [title, error, componentStack, screenName, occurredAt],
  );
  const [crashLogNotice, setCrashLogNotice] = useState<string>();

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

  function copyCrashLog() {
    platform.copyText(crashLog).then(() => setCrashLogNotice('Copied'), () => setCrashLogNotice("Couldn't copy"));
  }

  function shareCrashLog() {
    if (platform.shareText === null) {
      return;
    }
    platform.shareText(`${APP_NAME} crash log`, crashLog).catch(() => setCrashLogNotice("Couldn't share"));
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
      <details className="crash-log">
        <summary>Crash log</summary>
        <p className="desc">For a bug report. Read it before sharing: an error message can include what the app was working on.</p>
        <pre className="body" aria-label="Crash log">{crashLog}</pre>
        <button className="button button-secondary" onClick={copyCrashLog}>Copy crash log</button>
        {platform.shareText && <button className="button button-secondary" onClick={shareCrashLog}>Share crash log</button>}
        {crashLogNotice && <p role="status">{crashLogNotice}</p>}
      </details>
    </main>
  );
}

/** Catches a screen that throws while rendering (e.g. on damaged saved data),
 *  which would otherwise unmount the whole app and leave a blank page. */
export class AppErrorBoundary extends Component<
  { children: ReactNode; onTryAgain: () => void; onReset: () => Promise<void> },
  { renderError?: Error; componentStack?: string }
> {
  state: { renderError?: Error; componentStack?: string } = {};

  static getDerivedStateFromError(thrown: unknown) {
    return { renderError: thrown instanceof Error ? thrown : new Error(String(thrown)) };
  }

  // React passes which parts of the screen were drawing only here, after the error screen is chosen.
  componentDidCatch(_thrown: unknown, errorInfo: ErrorInfo) {
    if (errorInfo.componentStack) {
      this.setState({ componentStack: errorInfo.componentStack });
    }
  }

  render() {
    const { renderError, componentStack } = this.state;
    if (!renderError) return this.props.children;
    return (
      <AppError
        title="Something went wrong"
        error={renderError}
        componentStack={componentStack}
        onTryAgain={this.props.onTryAgain}
        onReset={this.props.onReset}
      />
    );
  }
}
