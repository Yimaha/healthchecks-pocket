// @vitest-environment node
// `npm run lint` fails on oxlint's warnings, not only its errors (--deny-warnings): a hook missing a dependency
// (react-hooks/exhaustive-deps) is only a warning, and would otherwise pass the lint and CI.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const tempDir = mkdtempSync(join(tmpdir(), 'hcp-lint-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

const lintScript: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.lint;
// The `oxlint …` command among the lint script's `&&`-joined steps.
const oxlintStep = lintScript.split('&&').map((step) => step.trim()).find((step) => step.split(' ')[0] === 'oxlint');

/** A component that sets the page's title from its `title` prop, in an effect with these dependencies. */
const pageTitleComponent = (effectDependencies: string) => `import { useEffect } from 'react';

export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, ${effectDependencies});
  return null;
}
`;

/** Runs the lint script's oxlint step as npm does (a shell with node_modules/.bin on the PATH), in a scratch repo
 *  holding the repo's oxlint config and this one component. */
function lintComponent(componentSource: string) {
  const scratchRepo = mkdtempSync(join(tempDir, 'repo-'));
  copyFileSync(join(ROOT, '.oxlintrc.json'), join(scratchRepo, '.oxlintrc.json'));
  writeFileSync(join(scratchRepo, 'PageTitle.tsx'), componentSource);
  // As JSON: oxlint's usual report changes with where it runs (an AI agent's shell gets a shorter one).
  const oxlintRun = spawnSync('sh', ['-c', `${oxlintStep} --format=json`], {
    cwd: scratchRepo, encoding: 'utf8', env: { ...process.env, PATH: `${join(ROOT, 'node_modules/.bin')}:${process.env.PATH}` },
  });
  const oxlintReport: { diagnostics: { code: string; severity: string }[] } = JSON.parse(oxlintRun.stdout);
  return { exitCode: oxlintRun.status, diagnostics: oxlintReport.diagnostics };
}

describe('npm run lint: oxlint', () => {
  it('is one of the lint steps', () => {
    expect(oxlintStep, lintScript).toBeDefined();
  });

  it('fails on a warning, such as a hook missing a dependency', () => {
    const missingDependencyLint = lintComponent(pageTitleComponent('[]'));
    expect(missingDependencyLint.diagnostics).toEqual([
      expect.objectContaining({ code: expect.stringContaining('exhaustive-deps'), severity: 'warning' }),
    ]);
    expect(missingDependencyLint.exitCode).not.toBe(0);
  });

  it('passes the same component with its dependency listed', () => {
    expect(lintComponent(pageTitleComponent('[title]'))).toEqual({ exitCode: 0, diagnostics: [] });
  });
});
