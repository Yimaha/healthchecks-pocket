// docs/media/settings.png: Settings with the demo project, appearance, API key protection and update checks.

import { addDemoProject, closeApp, elementWithText, pause, screenshot, showRoute, startFreshApp, waitFor } from './shared.mjs';

// 1. A fresh app: data cleared, started, connected.
await startFreshApp();
// 2. Onboarding with its defaults, then the demo project.
await addDemoProject();
// 3. Open Settings (#/settings), scrolled to the top.
await showRoute('#/settings');
// 4. Wait until the Projects section shows.
await waitFor(elementWithText('h2', 'Projects'), 'Settings');
// 5. Wait 1.5 s.
await pause(1500);
// 6. Screenshot.
await screenshot('settings.png');
await closeApp();
