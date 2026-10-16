// docs/media/check-list.png: the demo project's check list, as it opens (shown in the README).

import { addDemoProject, closeApp, pause, screenshot, showRoute, startFreshApp, waitFor } from './shared.mjs';

// 1. A fresh app: data cleared, started, connected.
await startFreshApp();
// 2. Onboarding with its defaults, then the demo project.
await addDemoProject();
// 3. Open the check list (#/), scrolled to the top.
await showRoute('#/');
// 4. Wait until all 6 demo checks are listed.
await waitFor("document.querySelectorAll('.check-row').length >= 6", 'the check list');
// 5. Wait 1.5 s for the refresh to finish and the northern lights to settle.
await pause(1500);
// 6. Screenshot.
await screenshot('check-list.png');
await closeApp();
