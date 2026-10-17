// What the app's FileProvider (AndroidManifest.xml) can hand to other apps: only files in the app's own cache, never
// the phone's shared storage.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('file provider paths', () => {
  it('cover only the app\'s cache', () => {
    const xml = readFileSync(resolve(import.meta.dirname, '../../android/app/src/main/res/xml/file_paths.xml'), 'utf8');
    const paths = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
    expect([...paths.children].map((sharedPath) => `${sharedPath.tagName} ${sharedPath.getAttribute('path')}`)).toEqual(['cache-path .']);
  });
});
