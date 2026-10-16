// docs/media/ping-body.png: homeserver's ping #409, a failed run's log with its [ERROR] and [DEBUG] lines coloured
// (in the gallery).

import { addDemoProject, closeApp, elementWithText, pause, screenshot, showRoute, startFreshApp, waitFor } from './shared.mjs';

// 1. A fresh app: data cleared, started, connected.
await startFreshApp();
// 2. Onboarding with its defaults, then the demo project.
await addDemoProject();
// 3. Open homeserver's ping #409 (#/check/demo-0001/ping/409), scrolled to the top.
await showRoute('#/check/demo-0001/ping/409');
// 4. Wait until its body, "FAIL (1 failing, 0 warnings)", shows.
await waitFor(elementWithText('pre', 'FAIL'), "the failed run's ping body");
// 5. Wait 1.5 s.
await pause(1500);
// 6. Screenshot.
await screenshot('ping-body.png');
await closeApp();
