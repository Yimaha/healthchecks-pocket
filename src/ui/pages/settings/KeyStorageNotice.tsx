import { useEffect, useState } from 'react';
import { loadKeepKeysOnDeviceOnly } from '@/core/projects/savedProjects';
import { platform } from '@/platform';
import { ChevronIcon, LockIcon, UnlockIcon } from '@/ui/components/InterfaceIcons';

/** Tells the user how the project's key is (or will be) stored, following
 *  the current "Keep API keys on this device only" setting. `saved`: the
 *  key is already stored (editing a project). Folded to its bold first line,
 *  which says what matters, so it doesn't fill the form every time. */
export function KeyStorageNotice({ saved }: { saved?: boolean }) {
  const protection = platform.secretProtection;
  // Unknown until the saved choice is read: show nothing rather than a
  // notice that may be wrong (an "encrypted" one when the user turned it off).
  const [keepKeysOnDeviceOnly, setKeepKeysOnDeviceOnly] = useState<boolean>();
  useEffect(() => { void loadKeepKeysOnDeviceOnly().then(setKeepKeysOnDeviceOnly); }, []);
  if (protection === 'none') {
    return (
      <details className="notice notice-warn">
        <summary><UnlockIcon /><strong>Not encrypted in the browser.</strong><ChevronIcon /></summary>
        <p>
          The web version keeps your API key in this browser's local storage. For encrypted storage, use the Android app.
        </p>
      </details>
    );
  }
  if (keepKeysOnDeviceOnly === undefined) return null;
  if (!keepKeysOnDeviceOnly) {
    return (
      <details className="notice notice-warn">
        <summary><UnlockIcon /><strong>Your API key {saved ? 'is' : 'will be'} saved unencrypted</strong><ChevronIcon /></summary>
        <p>
          with your settings, so it moves to a new phone with Android backup and transfer. You chose this in Settings (API
          keys).
        </p>
      </details>
    );
  }
  const store = protection === 'keychain' ? 'iOS Keychain' : 'Android Keystore';
  return (
    <details className="notice">
      <summary><LockIcon /><strong>Your API key is encrypted on this device</strong><ChevronIcon /></summary>
      <p>
        with a key held in the {store} (Capacitor Secure Storage plugin). That key never leaves this phone, so the API key
        isn't backed up or moved to a new phone. The project's name and settings are: on a new phone, you only paste the
        key again.
      </p>
    </details>
  );
}
