// @vitest-environment node
// The build scripts, run with the real `bash` (3.2 on macOS). They must be
// safe to use from any shell: running them is the only supported way, and
// sourcing one must not change the user's shell.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import semver from 'semver';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const supportedNodeRange: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines.node;
const RUNNABLE = ['setup', 'android', 'make-keystore', 'icons', 'shellcheck', 'actionlint', 'release-notes', 'check'];
const tempDir = mkdtempSync(join(tmpdir(), 'hcp-scripts-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function runShell(shell: string, script: string, env: Record<string, string> = {}, args: string[] = []) {
  // An emulator lock of the tests' own, never the machine's (scripts/lib.sh).
  const fullEnv = { ...process.env, HCP_EMULATOR_LOCK: join(tempDir, 'emulator.lock'), ...env };
  const result = spawnSync(shell, [...args, '-c', script], { cwd: ROOT, encoding: 'utf8', env: fullEnv });
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
      'unset HCP_EMULATOR_LOCK; declare -F | sort > /tmp/hcp-f1; compgen -v | sort > /tmp/hcp-v1; ' +
        '. scripts/lib.sh; ' +
        'declare -F | sort | comm -13 /tmp/hcp-f1 - | awk "{print \\$3}"; echo ---; ' +
        'compgen -v | sort | comm -13 /tmp/hcp-v1 - | grep -v "^_$\\|^c$"; rm -f /tmp/hcp-f1 /tmp/hcp-v1',
    );
    const [functionNames, vars] = result.out.split('---').map((part) => part.trim().split('\n').filter(Boolean));
    expect(functionNames.length).toBeGreaterThan(5);
    for (const name of functionNames) expect(name).toMatch(/^hcp_/);
    expect(vars.sort()).toEqual(['HCP_EMULATOR_LOCK', 'HCP_JAVA_MAJOR', 'HCP_ROOT']);
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
    // Neither is JDK 21, so it goes on to the machine's own JDKs and starts each one's java: seconds on CI's runner.
    expect(bash('. scripts/lib.sh; hcp_find_java21', { HCP_JAVA_HOME: jdk17, JAVA_HOME: jdk17 }).out).not.toBe(jdk17);
    expect(bash(`. scripts/lib.sh; hcp_java_major ${jdk17}`).out).toBe('17');
  }, 30_000);

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

  it('hcp_sha1 prints a standard checksum line', () => {
    const file = join(tempDir, 'hello.txt');
    writeFileSync(file, 'hello\n');
    expect(bash(`. scripts/lib.sh; hcp_sha1 ${file}`).out).toBe(`f572d396fae9206628714fb2ce00f72e94f2258f  ${file}`);
  });

  it('hcp_node_supported allows the Node.js versions that package.json\'s engines does, as npm reads it', () => {
    /** The version just before this one: 22.22.2 → 22.22.1, 24.15.0 → 24.14.99, 26.0.0 → 25.99.99. */
    const versionJustBefore = ({ major, minor, patch }: semver.SemVer) =>
      patch ? `${major}.${minor}.${patch - 1}` : minor ? `${major}.${minor - 1}.99` : `${major - 1}.99.99`;
    // For each Node.js line engines allows: the version just before its lowest, its lowest, and the next major's first.
    const nodeVersions = supportedNodeRange.split('||').flatMap((nodeLineRange) => {
      const lowestVersion = semver.minVersion(nodeLineRange)!;
      return [versionJustBefore(lowestVersion), lowestVersion.version, `${lowestVersion.major + 1}.0.0`].map((nodeVersion) => `v${nodeVersion}`);
    });
    const verdict = (nodeVersion: string, allowed: boolean) => `${nodeVersion} ${allowed ? 'allowed' : 'refused'}`;
    expect(nodeVersions.map((nodeVersion) => verdict(nodeVersion, bash(`. scripts/lib.sh; hcp_node_supported ${nodeVersion}`).code === 0)))
      .toEqual(nodeVersions.map((nodeVersion) => verdict(nodeVersion, semver.satisfies(nodeVersion, supportedNodeRange))));
  });
});

describe('emulator lock (hcp_emulator_lock)', () => {
  /** A lock file of its own for each test. */
  const lockPath = () => join(mkdtempSync(join(tempDir, 'lock-')), 'emulator.lock');
  /** Takes the lock as the scripts do; ANOTHER is a separate run trying to take it while this one holds it. */
  const take = '. scripts/lib.sh; hcp_emulator_lock || exit $?';
  const ANOTHER = `env -u HCP_EMULATOR_LOCKED_BY bash -c '${take}; echo other-got-it'; echo "other: $?"`;
  const run = (lock: string, script: string) => bash(`${take}; ${script}`, { HCP_EMULATOR_LOCK: lock });

  it('a free lock is taken for the run, naming it, and released when the run ends', () => {
    const lock = lockPath();
    const result = run(lock, 'cat "$HCP_EMULATOR_LOCK"');
    expect(result.code).toBe(0);
    expect(result.out).toMatch(new RegExp(`^\\d+ \\d\\d:\\d\\d:\\d\\d ${ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect(run(lock, 'echo taken-again').out).toBe('taken-again');
  });

  it('held by a run that is still going: another run stops at once with a warning naming it (exit 75)', () => {
    const result = run(lockPath(), `${ANOTHER}; echo "still mine: $(cut -d' ' -f1 "$HCP_EMULATOR_LOCK") = $$"`);
    expect(result.out).not.toContain('other-got-it');
    expect(result.out).toContain('other: 75');
    expect(result.err).toMatch(/The emulator is in use: .+ has been running on it since \d\d:\d\d:\d\d \(PID \d+\)\. Wait until it's done, then run this again\./);
    const [, label, self] = result.out.match(/still mine: (\d+) = (\d+)/) ?? [];
    expect(label).toBe(self);
  });

  it('released by the system when its run is killed (kill -9: no cleanup runs)', () => {
    const lock = lockPath();
    // The holder replaces itself with sleep (exec), so no child of it keeps the lock.
    const result = bash(
      `(${take}; exec sleep 30) & holder=$!; ` +
        'until [ "$(cut -d" " -f1 "$HCP_EMULATOR_LOCK" 2> /dev/null)" = "$$" ]; do sleep 0.05; done; ' +
        `${ANOTHER}; kill -9 $holder; wait $holder 2> /dev/null; ${ANOTHER}`,
      { HCP_EMULATOR_LOCK: lock },
    );
    expect(result.out.split('\n')).toEqual(['other: 75', 'other-got-it', 'other: 0']);
  });

  it('held for the scripts its run starts, and still held after they end', () => {
    const result = run(lockPath(), `bash -c '${take}; echo child-ran'; ${ANOTHER}`);
    expect(result.out.split('\n')).toEqual(['child-ran', 'other: 75']);
  });

  it('released early with hcp_emulator_unlock', () => {
    const result = run(lockPath(), `hcp_emulator_unlock; ${ANOTHER}`);
    expect(result.out.split('\n')).toEqual(['other-got-it', 'other: 0']);
  });

  it('kept by a process its run started and that outlived it: says so, and how to find it', () => {
    const lock = lockPath();
    // (Its output elsewhere, so the test doesn't wait for it.)
    const result = bash(`bash -c '${take}; sleep 5 > /dev/null 2>&1 & echo $!'; ${ANOTHER}`, { HCP_EMULATOR_LOCK: lock });
    const [leftover, ...rest] = result.out.split('\n');
    process.kill(Number(leftover));
    expect(rest).toEqual(['other: 75']);
    expect(result.err).toContain(`that outlived it. Find it with: lsof ${lock}`);
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

describe('make-keystore.sh', () => {
  it('gives keytool the password through the environment, so it never shows in `ps`', () => {
    // The script in a scratch repo, so it writes that repo's android/keystore.properties.
    const scratchRepo = mkdtempSync(join(tempDir, 'keystore-'));
    mkdirSync(join(scratchRepo, 'scripts'));
    mkdirSync(join(scratchRepo, 'android'));
    for (const name of ['make-keystore.sh', 'lib.sh']) copyFileSync(join(ROOT, 'scripts', name), join(scratchRepo, 'scripts', name));
    // A fake keytool that records its arguments (what `ps` shows) and creates the keystore ($3).
    const jdk = fakeJdk('21.0.5');
    writeFileSync(
      join(jdk, 'bin/keytool'),
      '#!/bin/sh\necho "$*" > "$KEYTOOL_LOG"\necho "$HCP_KEYSTORE_PASSWORD" >> "$KEYTOOL_LOG"\n: > "$3"\n',
    );
    chmodSync(join(jdk, 'bin/keytool'), 0o755);
    const keytoolLog = join(scratchRepo, 'keytool.log');

    const result = bash(`${scratchRepo}/scripts/make-keystore.sh ${scratchRepo}/keys/release.jks`, {
      HCP_JAVA_HOME: jdk,
      ANDROID_HOME: fakeSdk(),
      KEYTOOL_LOG: keytoolLog,
    });
    expect(result.code, result.err).toBe(0);

    const savedPassword = readFileSync(join(scratchRepo, 'android/keystore.properties'), 'utf8').match(/^storePassword=(.+)$/m)![1];
    const [keytoolArguments, keytoolEnvPassword] = readFileSync(keytoolLog, 'utf8').trim().split('\n');
    expect(keytoolArguments).toContain('-storepass:env HCP_KEYSTORE_PASSWORD -keypass:env HCP_KEYSTORE_PASSWORD');
    expect(keytoolArguments).not.toContain(savedPassword);
    expect(keytoolEnvPassword).toBe(savedPassword);
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

describe('setup.sh', () => {
  it('refuses a Node.js version that package.json\'s engines doesn\'t allow, before anything else, saying which to install', () => {
    // A node that says it's 24.12.0, older than the dependencies need, and runs scripts as the real one does.
    const fakeNodeDir = mkdtempSync(join(tempDir, 'node-'));
    writeFileSync(join(fakeNodeDir, 'node'), `#!/bin/sh\nif [ "$1" = -v ]; then echo v24.12.0; else exec "${process.execPath}" "$@"; fi\n`);
    chmodSync(join(fakeNodeDir, 'node'), 0o755);
    const nvmrcVersion = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
    const result = bash('scripts/setup.sh', { PATH: `${fakeNodeDir}:/usr/bin:/bin` });
    expect(result.code).toBe(1);
    expect(result.err).toContain(
      `Node.js v24.12.0 isn't supported: package.json's engines needs ${supportedNodeRange}. Install Node.js ${nvmrcVersion} ` +
        "(https://nodejs.org, or 'nvm install' in this folder) and re-run.",
    );
    expect(result.out).not.toContain(`Java`); // stopped before the JDK
  });

  it('refuses Android command-line tools whose checksum does not match the one in Google\'s index', () => {
    // A fake download server: an index in Google's layout (the SHA-1 on the line before the URL), and a tampered
    // download for every platform.
    const server = join(tempDir, 'sdk-repository');
    mkdirSync(server, { recursive: true });
    const platforms = ['mac_arm64', 'mac_x86_64', 'linux'];
    const archives = platforms.map((platform) =>
      `<archive><complete>\n<checksum type="sha1">${'a'.repeat(40)}</checksum>\n<url>commandlinetools-${platform}-1_latest.zip</url>\n</complete></archive>`,
    );
    writeFileSync(join(server, 'repository2-3.xml'), `<sdk-repository>\n${archives.join('\n')}\n</sdk-repository>\n`);
    for (const platform of platforms) writeFileSync(join(server, `commandlinetools-${platform}-1_latest.zip`), 'tampered');

    const emptySdk = mkdtempSync(join(tempDir, 'empty-sdk-'));
    const result = bash('scripts/setup.sh --yes', {
      HCP_SDK_REPOSITORY_URL: `file://${server}`,
      HCP_JAVA_HOME: fakeJdk('21.0.5'),
      ANDROID_HOME: emptySdk,
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, // node, but not an sdkmanager that's already installed
    });
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/Checksum mismatch for commandlinetools-\S+-1_latest\.zip \(expected a{40}, got [0-9a-f]{40}\)\. Not installing it\./);
    expect(spawnSync('ls', [emptySdk]).stdout?.toString() ?? '').toBe(''); // nothing installed
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

describe('check.sh', () => {
  /** What `--list` says for a change touching these files. */
  const list = (files: string[], args = '') => bash(`scripts/check.sh --list ${args}`, { HCP_CHANGED_FILES: files.join('\n') }).out;

  it('a docs change: the build, lint and unit tests only', () => {
    const out = list(['README.md']);
    for (const check of ['build', 'lint', 'unit']) expect(out).toMatch(new RegExp(`^${check} +run: always$`, 'm'));
    for (const check of ['e2e', 'emulator', 'release-apk', 'setup']) expect(out).toMatch(new RegExp(`^${check} +not needed$`, 'm'));
    expect(out).not.toContain('notice');
  });

  it('a change to the unit or screen tests: neither the browser nor the emulator tests', () => {
    const out = list(['tests/ui/pages/settings/settings.test.tsx']);
    expect(out).toMatch(/^e2e +not needed$/m);
    expect(out).toMatch(/^emulator +not needed$/m);
  });

  it('app code: the browser and emulator tests, saying which file needs them', () => {
    const out = list(['README.md', 'src/app/App.tsx']);
    expect(out).toMatch(/^e2e +run: src\/app\/App\.tsx changed$/m);
    expect(out).toMatch(/^emulator +run: src\/app\/App\.tsx changed$/m);
    expect(out).toMatch(/^release-apk +not needed$/m);
  });

  it('the Android project: the emulator tests and the release APK checks, not the browser tests', () => {
    const out = list(['android/app/build.gradle']);
    expect(out).toMatch(/^emulator +run: android\/app\/build\.gradle changed$/m);
    expect(out).toMatch(/^release-apk +run: android\/app\/build\.gradle changed$/m);
    expect(out).toMatch(/^e2e +not needed$/m);
  });

  it('setup.sh: runs it', () => {
    expect(list(['scripts/setup.sh'])).toMatch(/^setup +run: scripts\/setup\.sh changed$/m);
  });

  it('a workflow or a demo-media script: says what no local check covers', () => {
    const out = list(['.github/workflows/ci.yml', 'scripts/demo-media/walkthrough.mjs']);
    expect(out).toContain('notice: .github/workflows/ci.yml changed: a workflow change needs one real GitHub run too (docs/TESTING.md).');
    expect(out).toContain('notice: scripts/demo-media/walkthrough.mjs changed: run scripts/demo-media.sh for it');
  });

  it('--all: every check', () => {
    const out = list(['README.md'], '--all');
    for (const check of ['e2e', 'emulator', 'release-apk', 'setup']) expect(out).toMatch(new RegExp(`^${check} +run: --all$`, 'm'));
  });

  it('an unknown option prints usage and exits 1', () => {
    const result = bash('scripts/check.sh --bogus');
    expect(result.code).toBe(1);
    expect(result.out).toContain('scripts/check.sh --all');
  });
});

describe('check.sh: running the checks', () => {
  /** Runs it with a fake npm that logs each command and fails those in `failing`, a fake JDK, and an SDK whose adb
   *  finds an emulator or not (and with no emulator image to start). Logs go to a scratch cache, and the change is
   *  README.md alone (HCP_CHANGED_FILES). The emulator lock is its own; with `lockHeld`, another run holds it. The
   *  fake emulator tests take it as `npm run test:emulator` does and log who holds it, and the fake release-APK check
   *  (the next one) logs whether it's free again. */
  function check(args: string, { failing = [], emulator, lockHeld = false }: { failing?: string[]; emulator: boolean; lockHeld?: boolean }) {
    const dir = mkdtempSync(join(tempDir, 'check-'));
    const log = join(dir, 'npm.log');
    const lock = join(dir, 'emulator.lock');
    mkdirSync(join(dir, 'bin'));
    // The script's name: `npm run lint` → lint, `npm test` → test.
    writeFileSync(join(dir, 'bin/npm'), `#!/bin/sh\necho "$*" >> "${log}"\nif [ "$1" = run ]; then name=$2; else name=$1; fi\n` +
      `[ "$name" != test:emulator ] || bash -c '. scripts/lib.sh; hcp_emulator_lock && echo "lock: held by $(cut -d" " -f1 "$HCP_EMULATOR_LOCK"), for $HCP_EMULATOR_LOCKED_BY"' >> "${log}" || exit $?\n` +
      `[ "$name" != android:verify-release ] || env -u HCP_EMULATOR_LOCKED_BY bash -c '. scripts/lib.sh; hcp_emulator_lock 2> /dev/null && echo "lock: free after the emulator tests"' >> "${log}"\n` +
      `case " ${failing.join(' ')} " in *" $name "*) exit 1 ;; esac\n`);
    chmodSync(join(dir, 'bin/npm'), 0o755);
    const sdk = join(dir, 'sdk');
    mkdirSync(join(sdk, 'platform-tools'), { recursive: true });
    writeFileSync(join(sdk, 'platform-tools/adb'), `#!/bin/sh\nexit ${emulator ? 0 : 1}\n`);
    chmodSync(join(sdk, 'platform-tools/adb'), 0o755);
    // Another run holding the lock: one that took it and then became `sleep` (exec), for as long as check.sh runs.
    const holder = '(. scripts/lib.sh; hcp_emulator_lock; exec sleep 60) & holder=$!; until [ -s "$HCP_EMULATOR_LOCK" ]; do sleep 0.05; done; ';
    const result = bash(`${lockHeld ? holder : ''}scripts/check.sh ${args}; code=$?; ${lockHeld ? 'kill $holder; ' : ''}exit $code`, {
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`, ANDROID_HOME: sdk, HCP_JAVA_HOME: fakeJdk('21.0.5'),
      HCP_CHECK_CACHE: join(dir, 'cache'), HCP_CHANGED_FILES: 'README.md', HCP_EMULATOR_LOCK: lock,
    });
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    return { ...result, ran: lines.filter((line) => !line.startsWith('lock: ')), lockLog: lines.filter((line) => line.startsWith('lock: ')) };
  }

  it('--all: every check in order, with a summary, on the emulator that is running', () => {
    const result = check('--all', { emulator: true });
    expect(result.code).toBe(0);
    expect(result.ran).toEqual(['run build', 'run lint', 'run test:coverage', 'run test:e2e', 'run test:emulator', 'run android:verify-release', 'run setup -- --yes']);
    expect(result.out).toMatch(/^ +passed +emulator +--all$/m);
  });

  it('only the checks the change needs', () => {
    const result = check('', { emulator: true });
    expect(result.ran).toEqual(['run build', 'run lint', 'run test:coverage']);
    expect(result.out).toMatch(/^ +not needed +e2e/m);
  });

  it('keeps going after a failure, then lists it and exits 1', () => {
    const result = check('--all', { failing: ['lint'], emulator: true });
    expect(result.code).toBe(1);
    expect(result.ran).toEqual(['run build', 'run lint', 'run test:coverage', 'run test:e2e', 'run test:emulator', 'run android:verify-release', 'run setup -- --yes']);
    expect(result.out).toMatch(/^ +FAILED +lint +always$/m);
    expect(result.out).toMatch(/^ +passed +e2e +--all$/m);
  });

  it('the emulator tests run under its emulator lock, held for them, and released right after', () => {
    const result = check('--all', { emulator: true });
    expect(result.code).toBe(0);
    expect(result.lockLog).toHaveLength(2);
    const [, holder, heldFor] = result.lockLog[0].match(/^lock: held by (\d+), for (\d+)$/) ?? [];
    expect(holder).toBeDefined();
    expect(heldFor).toBe(holder);
    expect(result.lockLog[1]).toBe('lock: free after the emulator tests');
  });

  it('the emulator in use by another run: IN USE, not a failure of the change, but no pass either', () => {
    const result = check('--all', { emulator: true, lockHeld: true });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/^ +IN USE +emulator +--all$/m);
    expect(result.ran).not.toContain('run test:emulator');
    expect(result.out).toContain(`The emulator is in use: ${ROOT} has been running on it since`);
    expect(result.out).toMatch(/^ +passed +release-apk +--all$/m); // the rest still run
    expect(result.err).toContain('The emulator is in use by another run, so the emulator tests didn\'t run: wait until that run is done, then run npm run check again.');
    expect(result.err).not.toContain('Some checks failed');
  });

  it('without an emulator or one to start: the emulator tests fail, saying how to create one', () => {
    const result = check('--all', { emulator: false });
    expect(result.code).toBe(1);
    expect(result.ran).not.toContain('run test:emulator');
    expect(result.out).toMatch(/^ +FAILED +emulator +--all$/m);
    expect(result.out).toContain('No emulator to start. Create one with: scripts/setup.sh --emulator');
  });
});

describe('icons.sh', () => {
  /** The script and the icon master in a scratch repo, so the icons it renders land there. */
  function iconsRepo() {
    const scratchRepo = mkdtempSync(join(tempDir, 'icons-'));
    mkdirSync(join(scratchRepo, 'scripts'));
    mkdirSync(join(scratchRepo, 'assets'));
    mkdirSync(join(scratchRepo, 'public'));
    for (const name of ['icons.sh', 'lib.sh']) copyFileSync(join(ROOT, 'scripts', name), join(scratchRepo, 'scripts', name));
    copyFileSync(join(ROOT, 'assets/icon.svg'), join(scratchRepo, 'assets/icon.svg'));
    for (const dpi of ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      mkdirSync(join(scratchRepo, `android/app/src/main/res/mipmap-${dpi}`), { recursive: true });
    }
    return scratchRepo;
  }

  it('renders with the sharp-cli that package-lock.json pins', () => {
    const scratchRepo = iconsRepo();
    symlinkSync(join(ROOT, 'node_modules'), join(scratchRepo, 'node_modules'));
    const result = bash(`${scratchRepo}/scripts/icons.sh`);
    expect(result.code, result.err).toBe(0);
    const png = readFileSync(join(scratchRepo, 'public/icon-512.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512, 512]); // width and height, from the PNG header
  }, 30_000);

  it('refuses to run before npm ci, instead of downloading sharp-cli', () => {
    const scratchRepo = iconsRepo();
    const result = bash(`${scratchRepo}/scripts/icons.sh`);
    expect(result.code).toBe(1);
    expect(result.err).toContain("sharp-cli isn't installed. Run npm ci first.");
    expect(existsSync(join(scratchRepo, 'public/icon-512.png'))).toBe(false);
  });
});

describe('release-notes.sh', () => {
  /** The script in a scratch repo with this docs/CHANGELOG.md. */
  function repo(changelog: string) {
    const dir = mkdtempSync(join(tempDir, 'notes-'));
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(join(ROOT, 'scripts/release-notes.sh'), join(dir, 'scripts/release-notes.sh'));
    chmodSync(join(dir, 'scripts/release-notes.sh'), 0o755);
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/CHANGELOG.md'), changelog);
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
    expect(notes('0.5.0')).toEqual({ code: 1, out: '', err: 'docs/CHANGELOG.md has no notes for 0.5.0: add a "## 0.5.0" section.' });
    expect(notes('0.2.0').code).toBe(1);
    expect(notes('0.4')).toMatchObject({ code: 1 }); // not a prefix match
  });

  it('needs a version', () => {
    expect(notes()).toEqual({ code: 2, out: '', err: 'Usage: scripts/release-notes.sh <version>' });
  });

  it('docs/CHANGELOG.md has notes for the version in package.json', () => {
    const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
    const result = spawnSync('bash', ['scripts/release-notes.sh', version], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
