// @vitest-environment node
// Imports name what they import from src/ by where it is in src/ (`@/core/…`), not by how many folders up it is
// (`../../core/…`), so moving a file only changes the imports of what moved.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const SRC = join(ROOT, 'src');

const typeScriptPathsIn = (folder: string) =>
  readdirSync(join(ROOT, folder), { recursive: true, encoding: 'utf8' }).filter((path) => /\.tsx?$/.test(path)).map((path) => join(folder, path));

/** Every module a file imports, as written: import and export … from, import(), typeof import(), and vi.mock(). */
function importedModulesIn(repoPath: string): string[] {
  const source = ts.createSourceFile(repoPath, readFileSync(join(ROOT, repoPath), 'utf8'), ts.ScriptTarget.Latest, true, repoPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const importedModules: string[] = [];
  const addModuleName = (moduleName: ts.Node | undefined) => { if (moduleName && ts.isStringLiteralLike(moduleName)) importedModules.push(moduleName.text); };
  const collectImports = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) addModuleName(node.moduleSpecifier);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) addModuleName(node.arguments[0]);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) addModuleName(node.argument.literal);
    else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.getText(source) === 'vi.mock') addModuleName(node.arguments[0]);
    node.forEachChild(collectImports);
  };
  collectImports(source);
  return importedModules;
}

/** "file: module" for each import in the files that the predicate picks out. */
const importsWhere = (repoPaths: string[], isUnwanted: (repoPath: string, importedModule: string) => boolean) =>
  repoPaths.flatMap((repoPath) => importedModulesIn(repoPath).filter((importedModule) => isUnwanted(repoPath, importedModule)).map((importedModule) => `${repoPath}: ${importedModule}`));

const srcPaths = typeScriptPathsIn('src');
const testPaths = typeScriptPathsIn('tests');

describe('imports', () => {
  it('are read from every TypeScript file, in every form', () => {
    expect(srcPaths).toContain('src/main.tsx');
    expect(importedModulesIn('src/ui/IconPicker.tsx')).toContain('@/core/iconSearch');
    expect(importedModulesIn('tests/unit/projects.test.ts')).toContain('@/platform');
  });

  it('in src/ never climb out of the file\'s folder: what isn\'t beside or below it is @/…', () => {
    expect(importsWhere(srcPaths, (_repoPath, importedModule) => importedModule.startsWith('../'))).toEqual([]);
  });

  it('in tests/ reach src/ as @/…, not by a relative path', () => {
    const reachesSrcRelatively = (repoPath: string, importedModule: string) =>
      importedModule.startsWith('.') && !relative(SRC, resolve(ROOT, dirname(repoPath), importedModule)).startsWith('..');
    expect(importsWhere(testPaths, reachesSrcRelatively)).toEqual([]);
  });
});
