// @vitest-environment node
// The oldest WebView the app runs on: Capacitor refuses older ones with the update page, and the build targets it.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import capacitorConfig, { MIN_WEBVIEW_VERSION } from '../../capacitor.config';
import viteConfig from '../../vite.config';

const updatePagePath = new URL(`../../public/${capacitorConfig.server?.errorPath}`, import.meta.url);

describe('WebView support', () => {
  it('requires WebView 111, for color-mix() in the CSS', () => {
    expect(MIN_WEBVIEW_VERSION).toBe(111);
    expect(readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')).toContain('color-mix(');
    expect(capacitorConfig.android?.minWebViewVersion).toBe(MIN_WEBVIEW_VERSION);
  });

  it('builds the JavaScript for that same WebView', () => {
    expect(viteConfig).toMatchObject({ build: { target: expect.arrayContaining([`chrome${MIN_WEBVIEW_VERSION}`]) } });
  });

  it('shows an older WebView a plain page saying to update it, which needs no JavaScript', () => {
    expect(capacitorConfig.server?.errorPath).toBe('webview-update-needed.html');
    expect(existsSync(updatePagePath)).toBe(true);
    const updatePage = readFileSync(updatePagePath, 'utf8');
    expect(updatePage).not.toMatch(/<script/i);
    expect(updatePage).toContain('href="https://play.google.com/store/apps/details?id=com.google.android.webview"');
    expect(updatePage).toContain('href="https://play.google.com/store/apps/details?id=com.android.chrome"');
  });
});
