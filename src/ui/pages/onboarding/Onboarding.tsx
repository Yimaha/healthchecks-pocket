import { useMemo } from 'react';
import { APP_NAME } from '@/core/app';
import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from '@/core/ping-body/textSizes';
import { lineLevel } from '@/core/ping-body/pingBody';
import { settings } from '@/core/storage/storage';
import { timeZoneOptions } from '@/core/preferences/timezones';
import { platform } from '@/platform';
import { useReportLoading } from '@/ui/state/loadingState';
import { useStoredFlag, useStoredNumber } from '@/ui/hooks/useStored';
import { TextSize } from '@/ui/pages/ping-body/PingBody';
import { KeyProtection } from '@/ui/pages/settings/KeyProtection';
import { ThemePicker } from '@/ui/pages/settings/ThemePicker';
import { useTimeZone } from '@/ui/state/timeZoneState';
import { UpdateToggle } from '@/ui/pages/settings/UpdateSettings';
import { useUpdates } from '@/ui/state/updatesState';

const SAMPLE = ['[INFO] backup started', '[WARN] disk 91% full', '[ERROR] upload failed: connection timed out'];

/** First launch, before adding a project: the settings with their defaults
 *  picked, to change now or later in Settings. Every change applies (and is
 *  saved) at once; Continue just moves on. */
export function Onboarding({ onDone }: { onDone: (keepKeysOnDeviceOnly: boolean) => void }) {
  const timeZone = useTimeZone();
  const tzOptions = useMemo(() => timeZoneOptions(), []);
  const [size, setSize] = useStoredNumber('pingBody.size', DEFAULT_TEXT_SIZE, TEXT_SIZES[0], TEXT_SIZES[TEXT_SIZES.length - 1]);
  const [wrap, setWrap] = useStoredFlag('pingBody.wrap', true);
  const [keepKeysOnDeviceOnly, setKeepKeysOnDeviceOnly] = useStoredFlag('keys.deviceOnly', true);
  const updates = useUpdates();

  const done = () => {
    void settings.set('onboarded', '1').catch(() => {});
    onDone(keepKeysOnDeviceOnly); // the app saves the first project's key the way chosen here
  };

  // Setting up counts as "in progress": the northern lights play behind it.
  useReportLoading(true);

  return (
    <>
      <main className="page onboarding">
        <header className="hero">
          <img className="hero-icon" src="./icon-192.png" alt="" />
          <p className="hero-hello">Hello <span aria-hidden="true">👋</span></p>
          <h1>Welcome to {APP_NAME}</h1>
          <p className="hero-text">
            All your checks, a glance away. First, make it yours: everything below is already set
            to a good default, and you can change it any time in Settings.
          </p>
        </header>

        <h2 className="section-title">Appearance</h2>
        <ThemePicker defaultNote />

        <h2 className="section-title">Time zone</h2>
        <div className="card">
          <label className="field">
            <span className="hint">Times in the app are shown in</span>
            <select className="tz-picker" value={timeZone.choice} onChange={(event) => timeZone.setChoice(event.target.value)}>
              {tzOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <h2 className="section-title">Ping logs</h2>
        <div className="card">
          <div className="viewer-bar">
            <TextSize size={size} onChange={setSize} />
            <button className="viewer-toggle" onClick={() => setWrap(!wrap)} aria-pressed={wrap}>Wrap</button>
            {size === DEFAULT_TEXT_SIZE && wrap && <span className="hint">(defaults)</span>}
          </div>
          <pre className={`body${wrap ? '' : ' body-nowrap'}`} style={{ fontSize: `${size}px` }} aria-label="Sample log">
            {SAMPLE.map((line) => <span key={line} className={`line line-${lineLevel(line)}`}>{line}{'\n'}</span>)}
          </pre>
        </div>

        {platform.secretProtection !== 'none' && (
          <KeyProtection keepKeysOnDeviceOnly={keepKeysOnDeviceOnly} onChange={setKeepKeysOnDeviceOnly} />
        )}

        {updates.supported && (
          <>
            <h2 className="section-title">Updates</h2>
            <div className="card">
              <UpdateToggle enabled={updates.enabled} onChange={updates.setEnabled} />
            </div>
          </>
        )}

        <button className="button" onClick={done}>Let's go</button>
      </main>
    </>
  );
}
