// @vitest-environment node
// The Node.js versions the repo asks for, in the four places that say so: package.json's engines (what npm and
// scripts/setup.sh check), .nvmrc (what CI and `nvm install` use), the README, and @types/node (the Node APIs the code
// can call). They agree with each other; engines promises only what CI tests (.nvmrc's version, and later releases
// of its line), and only versions every dependency runs on, so `npm ci` never warns EBADENGINE on one the repo allows.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import semver from 'semver';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const readRepoFile = (repoPath: string) => readFileSync(resolve(ROOT, repoPath), 'utf8');
const packageJson = JSON.parse(readRepoFile('package.json'));
const supportedNodeRange: string = packageJson.engines.node;

interface LockedPackage {
  engines?: { node?: string };
  optional?: boolean;
}
/** The packages in package-lock.json that say which Node.js versions they run on. Optional ones are left out: they're
 *  other platforms' native builds, which npm skips where it can't use them. */
const lockedNodeRanges = Object.entries(JSON.parse(readRepoFile('package-lock.json')).packages as Record<string, LockedPackage>)
  .filter(([packagePath, lockedPackage]) => packagePath !== '' && lockedPackage.engines?.node && !lockedPackage.optional)
  .map(([packagePath, lockedPackage]) => ({ packagePath, nodeRange: lockedPackage.engines!.node! }));

/** A version as people write it: 26.0.0 as 26, 24.21.0 as 24.21. */
const shortVersion = ({ major, minor, patch }: semver.SemVer) => (patch ? `${major}.${minor}.${patch}` : minor ? `${major}.${minor}` : `${major}`);
/** How the README names one part of engines: ^24.21.0 as "24.21 or a later 24.x", >=26.0.0 as "26+". */
const readmeNodeVersions = (nodeLineRange: string) => {
  const lowestVersion = semver.minVersion(nodeLineRange)!;
  return nodeLineRange.trim().startsWith('^') ? `${shortVersion(lowestVersion)} or a later ${lowestVersion.major}.x` : `${shortVersion(lowestVersion)}+`;
};

describe('Node.js versions', () => {
  it('package.json\'s engines allows only versions that every locked dependency runs on', () => {
    expect(lockedNodeRanges.length).toBeGreaterThan(50);
    const dependenciesRefusingASupportedNode = lockedNodeRanges
      .filter(({ nodeRange }) => !semver.subset(supportedNodeRange, nodeRange))
      .map(({ packagePath, nodeRange }) => `${packagePath} needs ${nodeRange}`);
    expect(dependenciesRefusingASupportedNode).toEqual([]);
  });

  it('.nvmrc pins one exact version, CI\'s, and engines promises only it and later releases of its Node.js line', () => {
    // A bare major (24) lets nvm and CI pick any 24.x already installed, even one the dependencies refuse.
    const nvmrcVersion = readRepoFile('.nvmrc').trim();
    expect(semver.valid(nvmrcVersion), `.nvmrc: ${nvmrcVersion}`).toBe(nvmrcVersion.replace(/^v/, ''));
    // Nothing older than CI tests, and no other line: CI never runs one.
    expect(semver.minVersion(supportedNodeRange)!.version, supportedNodeRange).toBe(nvmrcVersion.replace(/^v/, ''));
    expect(semver.subset(supportedNodeRange, `^${nvmrcVersion}`), `${supportedNodeRange} within ^${nvmrcVersion}`).toBe(true);
  });

  it('the README asks for the versions engines allows', () => {
    // British English lists have no comma before "or".
    const readmeNodeRequirement = `Node.js ${new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(supportedNodeRange.split('||').map(readmeNodeVersions))}`;
    expect(readRepoFile('README.md')).toContain(readmeNodeRequirement);
  });

  it('@types/node is for the oldest Node.js line engines allows, so the code can\'t call an API that line lacks', () => {
    const oldestSupportedMajor = semver.minVersion(supportedNodeRange)!.major;
    expect(semver.subset(packageJson.devDependencies['@types/node'], `${oldestSupportedMajor}.x`), packageJson.devDependencies['@types/node']).toBe(true);
  });
});
