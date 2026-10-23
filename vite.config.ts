/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { MIN_WEBVIEW_VERSION } from './capacitor.config.ts';
import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The app's version, from package.json (shown in Settings, compared with
  // the latest release by the update check).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Relative paths so the same build works on GitHub Pages (a sub-path),
  // inside Capacitor's Android/iOS shells, and from any other host.
  base: './',
  // Set rather than left to Vite's default, so the JavaScript is built for exactly the WebView the app requires
  // (MIN_WEBVIEW_VERSION, which Android enforces). The rest are the same baseline for the web version.
  build: { target: [`chrome${MIN_WEBVIEW_VERSION}`, `edge${MIN_WEBVIEW_VERSION}`, 'firefox114', 'safari16.4', 'ios16.4'] },
  test: {
    // Unit (tests/unit) and screen (tests/ui) tests. Browser e2e tests live in
    // tests/e2e and run with Playwright (npm run test:e2e).
    include: ['tests/unit/**/*.test.ts', 'tests/ui/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    // Deterministic dates on every machine and CI: a non-UTC zone without daylight
    // saving (so "your zone first, then UTC" is testable) and a fixed locale.
    env: { TZ: 'Asia/Tokyo', LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' },
    // `npm run test:coverage`: line and branch coverage of src/ by the unit and screen tests (HTML report in coverage/).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // json-summary: the totals CI compares with main's (ci.yml).
      reporter: ['text', 'html', 'json', 'json-summary'],
      // The floor: a run below it fails. A PR also may not lower line coverage at all (TESTING.md).
      thresholds: { lines: 95.99 },
    },
  },
});
