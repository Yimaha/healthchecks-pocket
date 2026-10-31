import { APP_NAME } from '@/core/app';
import { DEFAULT_TEXT_SIZE } from '@/core/ping-body/textSizes';
import { lineLevel } from '@/core/ping-body/pingBody';
import { platform } from '@/platform';
import { useReportLoading } from '@/ui/state/loadingState';
import { useStoredFlag } from '@/ui/hooks/useStored';
import { useAppSettings } from '@/ui/state/appSettingsState';
import { TextSize } from '@/ui/pages/ping-body/PingBody';
import { KeyProtection } from '@/ui/pages/settings/KeyProtection';
import { ThemePicker } from '@/ui/pages/settings/ThemePicker';
import { TimeZonePicker } from '@/ui/pages/settings/TimeZonePicker';
import { UpdateToggle } from '@/ui/pages/settings/UpdateSettings';
import { useUpdates } from '@/ui/state/updatesState';

const SAMPLE = ['[INFO] backup started', '[WARN] disk 91% full', '[ERROR] upload failed: connection timed out'];

/** First launch, before adding a project: the settings with their defaults
 *  picked, to change now or later in Settings. Every change applies (and is
 *  saved) at once; Continue just moves on. */
export function Onboarding({ onDone }: { onDone: (keepKeysOnDeviceOnly: boolean) => void }) {
  const { appSettings, changeAppSettings } = useAppSettings();
  const size = appSettings.pingBodyTextSize;
  const setSize = (pingBodyTextSize: number) => changeAppSettings({ pingBodyTextSize });
  const wrap = appSettings.pingBodyWrapsLines;
  const setWrap = (pingBodyWrapsLines: boolean) => changeAppSettings({ pingBodyWrapsLines });
  const [keepKeysOnDeviceOnly, setKeepKeysOnDeviceOnly] = useStoredFlag('keys.deviceOnly', true);
  const updates = useUpdates();

  // The app saves that onboarding is done, and the first project's key the way chosen here.
  const done = () => onDone(keepKeysOnDeviceOnly);

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
        <TimeZonePicker />

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
