// @vitest-environment node
// One name per concept in the app's code (ARCHITECTURE.md's glossary), so a reader doesn't have to work out that two
// names are one thing. Names in the code only: settings saved on phones keep the names they have (src/core/storage.ts).

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../../src');

const parseSrcFile = (srcPath: string) =>
  ts.createSourceFile(srcPath, readFileSync(join(SRC, srcPath), 'utf8'), ts.ScriptTarget.Latest, false, srcPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Every name the file declares or uses (variables, functions, types, properties, parameters), as "file: name". */
function namesIn(srcPath: string): string[] {
  const names: string[] = [];
  const collectNames = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.push(`${srcPath}: ${node.text}`);
    node.forEachChild(collectNames);
  };
  collectNames(parseSrcFile(srcPath));
  return names;
}

const srcPaths = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((srcPath) => /\.tsx?$/.test(srcPath));
const namesInSrc = srcPaths.flatMap(namesIn);
const bareName = (nameInSrc: string) => nameInSrc.slice(nameInSrc.indexOf(': ') + 2);

describe('names in src/', () => {
  it('are read from every TypeScript file', () => {
    expect(srcPaths).toContain('core/projects.ts');
    expect(srcPaths).toContain('ui/App.tsx');
    expect(namesInSrc).toContain('core/projects.ts: loadProjects');
  });

  it('call a healthchecks.io project a project, never an account', () => {
    // healthchecks.io's account is the person's login, which holds their projects: only the link to its settings says so.
    const accountNames = namesInSrc.filter((nameInSrc) => /account/i.test(bareName(nameInSrc)) && bareName(nameInSrc) !== 'accountSettings');
    expect(accountNames).toEqual([]);
  });

  it('call "Keep API keys on this device only" keepKeysOnDeviceOnly, and nothing else', () => {
    const otherNames = namesInSrc.filter((nameInSrc) => /deviceOnly|onDevice|keepKeys/i.test(bareName(nameInSrc).replace(/keepKeysOnDeviceOnly/gi, '')));
    expect(otherNames).toEqual([]);
  });
});
