// @vitest-environment node
// The release workflow's sign job signs with APK Signature Scheme v2 and v3 only. apksigner adds v4 unless told not
// to, and its .idsig file would be published next to the APK and its .sha256.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release signing', () => {
  it('signs with v2 and v3, not v4, so the release holds only the APK and its .sha256', () => {
    const releaseWorkflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
    // The whole `apksigner sign` command: its line and the continuation lines after it.
    const apksignerSignCommand = /"\$\{buildToolsDir\}apksigner" sign(?:.*\\\n)*.*/.exec(releaseWorkflow)?.[0] ?? '';
    expect(apksignerSignCommand).toContain('--v2-signing-enabled true');
    expect(apksignerSignCommand).toContain('--v3-signing-enabled true');
    expect(apksignerSignCommand).toContain('--v4-signing-enabled false');
  });
});
