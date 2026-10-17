// What Android backs up and carries to a new phone: only the two Preferences files (src/platform/native.ts), never
// the secure storage that holds encrypted API keys, and carried keys only where the backup is encrypted on the phone.
// `scripts/android.sh release` checks the same in the built APK.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ANDROID = 'http://schemas.android.com/apk/res/android';

function readXml(path: string): Document {
  const xml = readFileSync(resolve(import.meta.dirname, '../../android/app/src/main', path), 'utf8');
  return new DOMParser().parseFromString(xml, 'application/xml');
}

/** Each rule in `element`, as `include sharedpref/CapacitorStorage.xml` (plus `requireFlags` when set). */
function rulesIn(element: Element): string[] {
  return [...element.children].map((rule) => {
    const flags = rule.getAttribute('requireFlags');
    return `${rule.tagName} ${rule.getAttribute('domain')}/${rule.getAttribute('path')}${flags ? ` requireFlags=${flags}` : ''}`;
  });
}

describe('backup rules', () => {
  it('the manifest allows backup with these rules', () => {
    const application = readXml('AndroidManifest.xml').querySelector('application')!;
    expect(application.getAttributeNS(ANDROID, 'allowBackup')).toBe('true');
    expect(application.getAttributeNS(ANDROID, 'fullBackupContent')).toBe('@xml/backup_rules');
    expect(application.getAttributeNS(ANDROID, 'dataExtractionRules')).toBe('@xml/data_extraction_rules');
  });

  it('Android 7 and 8: both files, carried keys in plain text (these versions can\'t encrypt a backup)', () => {
    expect(rulesIn(readXml('res/xml/backup_rules.xml').documentElement)).toEqual([
      'include sharedpref/CapacitorStorage.xml',
      'include sharedpref/CarriedApiKeys.xml',
    ]);
  });

  it('Android 9 to 11: carried keys only in a backup encrypted on the phone', () => {
    expect(rulesIn(readXml('res/xml-v28/backup_rules.xml').documentElement)).toEqual([
      'include sharedpref/CapacitorStorage.xml',
      'include sharedpref/CarriedApiKeys.xml requireFlags=clientSideEncryption',
    ]);
  });

  it('Android 12 and later: no Google backup unless it is encrypted on the phone; phone-to-phone transfer carries both files', () => {
    const rules = readXml('res/xml/data_extraction_rules.xml').documentElement;
    expect([...rules.children].map((section) => section.tagName)).toEqual(['cloud-backup', 'device-transfer']);
    const cloudBackup = rules.querySelector('cloud-backup')!;
    expect(cloudBackup.getAttribute('disableIfNoEncryptionCapabilities')).toBe('true');
    expect(rulesIn(cloudBackup)).toEqual(['include sharedpref/CapacitorStorage.xml', 'include sharedpref/CarriedApiKeys.xml']);
    expect(rulesIn(rules.querySelector('device-transfer')!)).toEqual(['include sharedpref/CapacitorStorage.xml', 'include sharedpref/CarriedApiKeys.xml']);
  });
});
