import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Every browser-environment test starts from an empty browser on the check
// list: no saved projects, no remembered time zone or folded sections, real
// timers. (Node-environment tests, like the script tests, skip this.)
const browser = typeof window !== 'undefined';

beforeEach(() => {
  if (!browser) return;
  window.scrollTo = () => {}; // jsdom doesn't implement it; route changes call it
  Element.prototype.scrollIntoView = () => {}; // nor this; the ping body search calls it
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  window.location.hash = '';
});

afterEach(() => {
  if (browser) cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
