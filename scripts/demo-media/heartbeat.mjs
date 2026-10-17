// docs/media/heartbeat.gif: 14 seconds of the "Heartbeat monitor" background: the check list in the dark theme →
// Settings, where it's chosen, switched to the light theme → back to the list (in the gallery).

import { addDemoProject, chooseOption, closeApp, makeGif, pause, recordScreen, showRoute, startFreshApp, waitFor } from './shared.mjs';

const backgroundPicker = "[...document.querySelectorAll('.appearance select')].at(-1)";
const themePicker = "document.querySelector('.appearance select')";

// 1. A fresh app: data cleared, started, connected.
await startFreshApp();
// 2. Onboarding: pick Background "Heartbeat monitor", then the demo project as usual.
await chooseOption(backgroundPicker, 'heartbeat', "onboarding's Background picker");
await waitFor("document.querySelector('.heartbeat canvas')", 'the heartbeat monitor');
await addDemoProject();
// 3. Open the check list (#/), wait for its 6 checks, then 1.5 s.
await showRoute('#/');
await waitFor("document.querySelectorAll('.check-row').length >= 6", 'the check list');
await pause(1500);
// 4. Start recording the screen for 14 s.
const recordingSaved = recordScreen(14, 'heartbeat.mp4');
// 5. Wait 6 s on the check list: a few beats in the dark theme.
await pause(6000);
// 6. Open Settings at Appearance (Background: Heartbeat monitor), wait 2 s, switch to the light theme, wait 2 s.
await showRoute('#/settings');
await chooseOption(themePicker, 'dark', 'the Theme picker'); // (unchanged: scrolls Appearance into view)
await pause(2000);
await chooseOption(themePicker, 'light', 'the Theme picker');
await pause(2000);
// 7. Back to the check list for the rest of the recording, in the light theme.
await showRoute('#/');
// 8. Wait for the recording to end and be copied off the emulator, then turn it into the GIF: 20 fps rather than
// the usual 12, so the moving trace shows as smoothly as it plays.
await recordingSaved;
await makeGif('heartbeat.mp4', 'heartbeat.gif', { fps: 20 });
await closeApp();
