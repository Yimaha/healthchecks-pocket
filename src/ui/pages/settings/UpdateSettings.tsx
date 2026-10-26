import { useState } from 'react';
import { APP_VERSION } from '@/core/app';
import { UpdatePrompt } from '@/ui/components/UpdatePrompt';
import { useUpdates, type CheckResult } from '@/ui/state/updatesState';

/** Settings: the daily check on or off, and Check now. */
export function UpdateSettings() {
  const { supported, enabled, setEnabled, checkNow } = useUpdates();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult>();
  if (!supported) {
    return null;
  }
  const check = async () => {
    setBusy(true);
    setResult(undefined);
    setResult(await checkNow());
    setBusy(false);
  };
  return (
    <>
      <h2 className="section-title">Updates</h2>
      <div className="card">
        <UpdateToggle enabled={enabled} onChange={setEnabled} />
        <div className="update-check-now">
          <button className="link-button" onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check now'}</button>
          {result === 'latest' && <span className="hint" role="status">You're up to date ({APP_VERSION}).</span>}
          {result === 'error' && <span className="hint" role="status">Couldn't reach GitHub. Try again later.</span>}
        </div>
      </div>
      <UpdatePrompt />
    </>
  );
}

export function UpdateToggle({ enabled, onChange }: { enabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <>
      <label className="toggle-row">
        <input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} />
        <span>Check for updates once a day</span>
      </label>
      <p className="hint-text">Asks GitHub (api.github.com) for the latest release. GitHub sees your IP address, Android version and phone model, as any website would, but nothing about your checks.</p>
    </>
  );
}
