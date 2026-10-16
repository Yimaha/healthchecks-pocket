// docs/media/walkthrough.gif: 16 seconds of use: the check list → the "homeserver" check → its failed ping #409 →
// back to the list.

import { addDemoProject, closeApp, elementContainingText, elementWithText, makeGif, pause, pressBack, recordScreen, showRoute, startFreshApp, tap, waitFor } from './shared.mjs';

// 1. A fresh app: data cleared, started, connected.
await startFreshApp();
// 2. Onboarding with its defaults, then the demo project.
await addDemoProject();
// 3. Open the check list (#/), wait for its 6 checks, then 1.5 s.
await showRoute('#/');
await waitFor("document.querySelectorAll('.check-row').length >= 6", 'the check list');
await pause(1500);
// 4. Start recording the screen for 16 s.
const recordingSaved = recordScreen(16, 'walkthrough.mp4');
// 5. Wait 2 s on the check list.
await pause(2000);
// 6. Tap the "homeserver" check, then wait 3 s on its page.
await tap(elementWithText('.check-row', 'homeserver'), 'the homeserver check');
await pause(3000);
// 7. Tap ping #409 in its ping log, then wait 4 s on the log.
await tap(elementContainingText('.ping-row', '#409'), 'ping #409');
await pause(4000);
// 8. Press Back (to the check), wait 2 s, press Back again (to the list).
await pressBack();
await pause(2000);
await pressBack();
// 9. Wait for the recording to end and be copied off the emulator, then turn it into the GIF.
await recordingSaved;
await makeGif('walkthrough.mp4', 'walkthrough.gif');
await closeApp();
