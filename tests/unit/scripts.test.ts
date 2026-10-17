// @vitest-environment node
// The build scripts, run with the real `bash` (3.2 on macOS). They must be
// safe to use from any shell: running them is the only supported way, and
// sourcing one must not change the user's shell.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const RUNNABLE = ['setup', 'android', 'make-keystore', 'icons', 'shellcheck', 'actionlint', 'release-notes'];
const tempDir = mkdtempSync(join(tmpdir(), 'hcp-scripts-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function runShell(shell: string, script: string, env: Record<string, string> = {}, args: string[] = []) {
  const result = spawnSync(shell, [...args, '-c', script], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}
const bash = (script: string, env?: Record<string, string>) => runShell('bash', script, env);
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

/** A fake JDK whose `java -version` reports `version`. */
function fakeJdk(version: string) {
  const home = join(tempDir, `jdk-${version}`);
  mkdirSync(join(home, 'bin'), { recursive: true });
  writeFileSync(join(home, 'bin/java'), `#!/bin/sh\necho 'openjdk version "${version}" 2025-01-01' >&2\n`);
  chmodSync(join(home, 'bin/java'), 0o755);
  return home;
}

function fakeSdk() {
  const sdk = join(tempDir, 'sdk');
  mkdirSync(join(sdk, 'cmdline-tools/latest/bin'), { recursive: true });
  writeFileSync(join(sdk, 'cmdline-tools/latest/bin/sdkmanager'), '#!/bin/sh\n');
  chmodSync(join(sdk, 'cmdline-tools/latest/bin/sdkmanager'), 0o755);
  return sdk;
}

describe('sourcing is refused', () => {
  it.each(RUNNABLE)('bash: `source scripts/%s.sh` returns 1 and leaves the shell untouched', (name) => {
    const result = bash(
      `source scripts/${name}.sh; echo "rc=$?"; [[ $- == *e* ]] && echo errexit-on; ` +
        `declare -F | grep -c ' hcp_' || true; echo alive`,
    );
    expect(result.err).toBe(`Run scripts/${name}.sh instead of sourcing it.`);
    expect(result.out.split('\n')).toEqual(['rc=1', '0', 'alive']);
  });

  it.skipIf(!hasZsh).each(RUNNABLE)('zsh: `source scripts/%s.sh` returns 1 and zsh keeps running', (name) => {
    const result = runShell('zsh', `source scripts/${name}.sh; echo "rc=$?"; echo alive`);
    expect(result.err).toBe(`Run scripts/${name}.sh instead of sourcing it.`);
    expect(result.out.split('\n')).toEqual(['rc=1', 'alive']);
  });

  it('lib.sh refuses to load into an interactive shell', () => {
    const result = runShell('bash', 'source scripts/lib.sh; echo "rc=$?"; declare -F | grep -c " hcp_" || true', {}, ['-i']);
    expect(result.err).toContain('scripts/lib.sh is loaded by the scripts in scripts/; run those instead.');
    expect(result.out.split('\n')).toEqual(['rc=1', '0']);
  });
});

describe('lib.sh', () => {
  it('only adds hcp_-prefixed functions and HCP_-prefixed variables', () => {
    const result = bash(
      'declare -F | sort > /tmp/hcp-f1; compgen -v | sort > /tmp/hcp-v1; ' +
        '. scripts/lib.sh; ' +
        'declare -F | sort | comm -13 /tmp/hcp-f1 - | awk "{print \\$3}"; echo ---; ' +
        'compgen -v | sort | comm -13 /tmp/hcp-v1 - | grep -v "^_$\\|^c$"; rm -f /tmp/hcp-f1 /tmp/hcp-v1',
    );
    const [functionNames, vars] = result.out.split('---').map((part) => part.trim().split('\n').filter(Boolean));
    expect(functionNames.length).toBeGreaterThan(5);
    for (const name of functionNames) expect(name).toMatch(/^hcp_/);
    expect(vars.sort()).toEqual(['HCP_JAVA_MAJOR', 'HCP_ROOT']);
  });

  it('hcp_die prints to stderr and exits 1', () => {
    const result = bash('. scripts/lib.sh; (hcp_die "boom"); echo "rc=$?"');
    expect(result.err).toContain('error:');
    expect(result.err).toContain('boom');
    expect(result.out).toBe('rc=1');
  });

  it('finds JDK 21 from HCP_JAVA_HOME first, and never accepts another version', () => {
    const jdk21 = fakeJdk('21.0.5');
    const jdk17 = fakeJdk('17.0.9');
    expect(bash('. scripts/lib.sh; hcp_find_java21', { HCP_JAVA_HOME: jdk21 }).out).toBe(jdk21);
    expect(bash('. scripts/lib.sh; hcp_find_java21', { HCP_JAVA_HOME: jdk17, JAVA_HOME: jdk21 }).out).toBe(jdk21);
    expect(bash('. scripts/lib.sh; hcp_find_java21', { HCP_JAVA_HOME: jdk17, JAVA_HOME: jdk17 }).out).not.toBe(jdk17);
    expect(bash(`. scripts/lib.sh; hcp_java_major ${jdk17}`).out).toBe('17');
  });

  it('finds the Android SDK from ANDROID_HOME first, and its tools', () => {
    const sdk = fakeSdk();
    expect(bash('. scripts/lib.sh; hcp_find_android_sdk', { ANDROID_HOME: sdk }).out).toBe(sdk);
    expect(bash(`. scripts/lib.sh; hcp_sdk_tool ${sdk} sdkmanager`).out).toBe(join(sdk, 'cmdline-tools/latest/bin/sdkmanager'));
  });

  it('hcp_load_env exports the tools for the build', () => {
    const result = bash('. scripts/lib.sh; hcp_load_env; echo "$JAVA_HOME|$ANDROID_HOME|$ANDROID_SDK_ROOT"; echo "$PATH" | cut -d: -f1', {
      HCP_JAVA_HOME: fakeJdk('21.0.5'),
      ANDROID_HOME: fakeSdk(),
    });
    const [homes, firstPath] = result.out.split('\n');
    expect(homes).toBe(`${join(tempDir, 'jdk-21.0.5')}|${join(tempDir, 'sdk')}|${join(tempDir, 'sdk')}`);
    expect(firstPath).toBe(join(tempDir, 'jdk-21.0.5/bin'));
  });

  it('hcp_sha256 prints a standard checksum line', () => {
    const file = join(tempDir, 'hello.txt');
    writeFileSync(file, 'hello\n');
    expect(bash(`. scripts/lib.sh; hcp_sha256 ${file}`).out).toBe(
      `5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03  ${file}`,
    );
  });
});

describe('arguments', () => {
  it('setup.sh --help prints usage and exits 0', () => {
    const result = bash('scripts/setup.sh --help');
    expect(result.code).toBe(0);
    expect(result.out).toContain('scripts/setup.sh --emulator');
  });

  it('setup.sh rejects unknown options', () => {
    const result = bash('scripts/setup.sh --bogus');
    expect(result.code).toBe(1);
    expect(result.err).toContain('unknown option: --bogus (see --help)');
  });

  it.each([[''], ['bogus']])('android.sh %j prints usage and exits 1 without doing anything', (arg) => {
    const result = bash(`scripts/android.sh ${arg}`);
    expect(result.code).toBe(1);
    expect(result.out).toContain('scripts/android.sh build');
    expect(result.out).toContain('scripts/android.sh phone');
    expect(result.out).toContain('scripts/android.sh test');
    expect(result.out).toContain('scripts/android.sh verify-release');
  });

  it('make-keystore.sh never overwrites an existing signing key', () => {
    const existing = join(tempDir, 'existing.jks');
    writeFileSync(existing, 'precious');
    const result = bash(`scripts/make-keystore.sh ${existing}`, { HCP_JAVA_HOME: fakeJdk('21.0.5'), ANDROID_HOME: fakeSdk() });
    expect(result.code).toBe(1);
    expect(result.err).toContain('already exists. Not overwriting a signing key.');
  });
});

describe('shellcheck.sh', () => {
  it('refuses to run a download whose checksum does not match the pinned one', () => {
    // A fake release server with a tampered archive for every platform.
    const server = join(tempDir, 'releases/v0.11.0');
    mkdirSync(server, { recursive: true });
    for (const arch of ['darwin.aarch64', 'darwin.x86_64', 'linux.x86_64', 'linux.aarch64']) {
      writeFileSync(join(server, `shellcheck-v0.11.0.${arch}.tar.xz`), 'tampered');
    }
    const cache = join(tempDir, 'sc-cache');
    const result = bash('scripts/shellcheck.sh --version', {
      HCP_SC_BASE_URL: `file://${join(tempDir, 'releases')}`,
      HCP_SC_CACHE: cache,
    });
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/Checksum mismatch for shellcheck-v0\.11\.0\.\S+\.tar\.xz .*Not running it\./);
    expect(spawnSync('ls', [cache]).stdout?.toString() ?? '').toBe(''); // nothing cached
  });
});

describe('actionlint.sh', () => {
  it('refuses to run a download whose checksum does not match the pinned one', () => {
    // A fake release server with a tampered archive for every platform.
    const server = join(tempDir, 'al-releases/v1.7.12');
    mkdirSync(server, { recursive: true });
    for (const arch of ['darwin_arm64', 'darwin_amd64', 'linux_amd64', 'linux_arm64']) {
      writeFileSync(join(server, `actionlint_1.7.12_${arch}.tar.gz`), 'tampered');
    }
    const cache = join(tempDir, 'al-cache');
    const result = bash('scripts/actionlint.sh --version', {
      HCP_AL_BASE_URL: `file://${join(tempDir, 'al-releases')}`,
      HCP_AL_CACHE: cache,
    });
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/Checksum mismatch for actionlint_1\.7\.12_\S+\.tar\.gz .*Not running it\./);
    expect(spawnSync('ls', [cache]).stdout?.toString() ?? '').toBe(''); // nothing cached
  });
});

describe('release-notes.sh', () => {
  /** The script in a scratch repo with this CHANGELOG.md. */
  function repo(changelog: string) {
    const dir = mkdtempSync(join(tempDir, 'notes-'));
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(join(ROOT, 'scripts/release-notes.sh'), join(dir, 'scripts/release-notes.sh'));
    chmodSync(join(dir, 'scripts/release-notes.sh'), 0o755);
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
    return (version?: string) => {
      const result = spawnSync('bash', [join(dir, 'scripts/release-notes.sh'), ...(version ? [version] : [])], { cwd: tempDir, encoding: 'utf8' });
      return { code: result.status, out: result.stdout, err: result.stderr.trim() };
    };
  }
  const notes = repo('# Changelog\n\nIntro.\n\n## 0.4.0\n\n- New thing\n- Other thing\n\n\n## 0.3.0\n- Old thing\n\n## 0.2.0\n\n');

  it('prints the version\'s section, without the blank lines around it or the next section', () => {
    expect(notes('0.4.0')).toEqual({ code: 0, out: '- New thing\n- Other thing\n', err: '' });
    expect(notes('0.3.0').out).toBe('- Old thing\n');
  });

  it('takes the tag name too (v0.4.0)', () => {
    expect(notes('v0.4.0').out).toBe('- New thing\n- Other thing\n');
  });

  it('fails when the version has no notes, or an empty section', () => {
    expect(notes('0.5.0')).toEqual({ code: 1, out: '', err: 'CHANGELOG.md has no notes for 0.5.0: add a "## 0.5.0" section.' });
    expect(notes('0.2.0').code).toBe(1);
    expect(notes('0.4')).toMatchObject({ code: 1 }); // not a prefix match
  });

  it('needs a version', () => {
    expect(notes()).toEqual({ code: 2, out: '', err: 'Usage: scripts/release-notes.sh <version>' });
  });

  it('CHANGELOG.md has notes for the version in package.json', () => {
    const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
    const result = spawnSync('bash', ['scripts/release-notes.sh', version], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
