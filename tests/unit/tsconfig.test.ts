// @vitest-environment node
// Every TypeScript project sets strict mode itself, rather than relying on TypeScript 6's default, which another
// version or tool reading these files may not share.

import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const readTsconfig = (file: string) => ts.readConfigFile(resolve(ROOT, file), ts.sys.readFile).config;
const projects: string[] = readTsconfig('tsconfig.json').references.map((reference: { path: string }) => reference.path);

describe('TypeScript projects', () => {
  it('are the app, the build configs and the tests', () => {
    expect(projects).toEqual(['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.test.json']);
  });

  it.each(projects)('%s turns strict mode on', (project) => {
    expect(readTsconfig(project).compilerOptions.strict).toBe(true);
  });
});
