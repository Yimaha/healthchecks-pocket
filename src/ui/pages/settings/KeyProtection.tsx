import { ErrorBanner } from '@/ui/components/ErrorBanner';

/** "Keep API keys on this device only": on by default. Off keeps keys
 *  unencrypted with the settings, so they move to a new phone. */
export function KeyProtection({ keepKeysOnDeviceOnly, onChange, saving, error }: {
  keepKeysOnDeviceOnly: boolean;
  onChange: (chosenKeepKeysOnDeviceOnly: boolean) => void;
  saving?: boolean;
  error?: Error;
}) {
  const changeKeepKeysOnDeviceOnly = (chosenKeepKeysOnDeviceOnly: boolean) => {
    if (!chosenKeepKeysOnDeviceOnly && !confirm(
      'Save API keys unencrypted with your settings? Android backup and phone-to-phone transfer will then carry them to a new phone, and anyone who can read your backup or this app\'s data could read them. Without a screen lock, Google backup isn\'t encrypted on your phone, so the keys are left out of it. Android 7 and 8 can\'t encrypt it at all: there, the keys go to Google in plain text.',
    )) {
      return;
    }
    onChange(chosenKeepKeysOnDeviceOnly);
  };
  return (
    <>
      <h2 className="section-title">API keys</h2>
      <div className="card">
        <label className="toggle-row">
          <input type="checkbox" checked={keepKeysOnDeviceOnly} disabled={saving} onChange={(event) => changeKeepKeysOnDeviceOnly(event.target.checked)} />
          <span>Keep API keys on this device only <span className="hint">(recommended)</span></span>
        </label>
        <p className="hint-text">
          {keepKeysOnDeviceOnly
            ? 'Encrypted with a key that never leaves this phone. On a new phone, your projects come along and you paste their keys again.'
            : 'Saved unencrypted with your settings, so they move to a new phone with Android backup and transfer. Without a screen lock they\'re left out of Google backup; on Android 7 and 8 they go to Google in plain text. Turning this back on removes them from this phone, but your last backup keeps them until the next one, so change the keys if that matters.'}
        </p>
        {error && <ErrorBanner error={error} />}
      </div>
    </>
  );
}
