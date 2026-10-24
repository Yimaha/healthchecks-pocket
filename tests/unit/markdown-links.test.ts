// @vitest-environment node
// Every relative link and image in the repo's Markdown leads somewhere: to a file in the repo or, climbing out of it,
// to one of the repo's pages on GitHub (../../issues from a file at the root). Moving a file can break either kind.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

interface MarkdownLink {
  markdownPath: string;
  target: string;
}

const markdownPaths = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

/** The file's relative links and images. Code is left out: it shows paths, it doesn't link to them. */
function relativeLinksIn(markdownPath: string): MarkdownLink[] {
  const markdown = readFileSync(join(ROOT, markdownPath), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const targets = [...markdown.matchAll(/\]\(([^)\s]+)[^)]*\)|\b(?:src|href)="([^"]+)"/g)].map((match) => match[1] ?? match[2]);
  return targets.filter((target) => !/^(https?:|mailto:|#)/.test(target)).map((target) => ({ markdownPath, target }));
}

const links = markdownPaths.flatMap(relativeLinksIn);
const repoPathOf = (link: MarkdownLink) => normalize(join(dirname(link.markdownPath), link.target.split('#')[0]));
const climbsOutOfRepo = (link: MarkdownLink) => repoPathOf(link).startsWith('..');

describe('links in Markdown', () => {
  it('are read from every Markdown file', () => {
    expect(markdownPaths).toContain('README.md');
    expect(links.length).toBeGreaterThan(20);
  });

  it('lead to files that exist', () => {
    const broken = links.filter((link) => !climbsOutOfRepo(link) && !existsSync(join(ROOT, repoPathOf(link))));
    expect(broken).toEqual([]);
  });

  it('climb out of the repo only as far as its pages on GitHub', () => {
    // GitHub shows a file at <repo>/blob/<branch>/<folders>/<file>: from there, one ../ per folder and two more reach <repo>/.
    const wrongClimbs = links.filter(climbsOutOfRepo).filter((link) => {
      const climbs = link.target.match(/^(\.\.\/)*/)![0].length / 3;
      const folders = dirname(link.markdownPath).split('/').filter((folder) => folder !== '.').length;
      return climbs !== folders + 2;
    });
    expect(wrongClimbs).toEqual([]);
  });
});
