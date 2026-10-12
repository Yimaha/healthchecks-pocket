/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The app's version, from package.json (shown in Settings, compared with
  // the latest release by the update check).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Relative paths so the same build works on GitHub Pages (a sub-path),
  // inside Capacitor's Android/iOS shells, and from any other host.
  base: './',
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
  },
})
