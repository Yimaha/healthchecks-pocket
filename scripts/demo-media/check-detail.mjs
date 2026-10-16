// docs/media/check-detail.png: the "homeserver" check, with its status changes and ping log (in the README).

import { addDemoProject, closeApp, pause, screenshot, showRoute, startFreshApp, waitFor } from './shared.mjs';

// 1. A fresh app: data cleared, started, connected.
await startFreshApp();
// 2. Onboarding with its defaults, then the demo project.
await addDemoProject();
// 3. Open the "homeserver" check (#/check/demo-0001), scrolled to the top.
await showRoute('#/check/demo-0001');
// 4. Wait until its 6 pings are listed.
await waitFor("document.querySelectorAll('.ping-row').length >= 6", 'the check and its pings');
// 5. Wait 1.5 s.
await pause(1500);
// 6. Screenshot.
await screenshot('check-detail.png');
await closeApp();
