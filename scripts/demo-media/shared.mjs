// Shared tools for the scripts in this folder, which scripts/demo-media.sh runs one after another. Each script makes
// one file in docs/media/ and starts from a fresh app of its own (startFreshApp), so changing one can't break another.
//
// The page is read and changed over the app WebView's Chrome DevTools Protocol socket (debug builds open one), taps
// go through `adb shell input tap`, as a finger would, and every image is cropped to the app, without Android's
// status and navigation bars.

import { execFile, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mediaDir = `${repoRoot}docs/media`;
// The uncropped screenshots and the screen recording stay out of the repo (GitHub doesn't play video files).
const workDir = `${repoRoot}.cache/demo-media`;
const APP_ID = 'io.github.yimaha.healthcheckspocket'; // appId in capacitor.config.ts
const DEVTOOLS_PORT = 9333;

let page; // the app's page, once startFreshApp has connected to it
let appTopPx; // where the app is drawn on screen: from the bottom of the status bar...
let appHeightPx; // ...down to the top of the navigation bar

// ------------------------------------------------------- starting and setup

/** Start the app as if just installed (its data cleared), and connect to its page. Refuses a real phone. */
export async function startFreshApp() {
  // Clearing the app's data on a real phone would delete its projects and API keys.
  const isEmulator = (await adbShell('getprop', 'ro.kernel.qemu')).trim() === '1';
  if (!isEmulator) {
    throw new Error("That's a real device; this runs on the emulator only.");
  }
  await adbShell('am', 'force-stop', APP_ID);
  await adbShell('pm', 'clear', APP_ID);
  await adbShell('am', 'start', '-W', '-n', `${APP_ID}/.MainActivity`);
  const appPid = (await adbShell('pidof', APP_ID)).trim();
  // A debug build's WebView opens a DevTools socket named after the app's process.
  await waitUntil(async () => (await adbShell('cat', '/proc/net/unix')).includes(`webview_devtools_remote_${appPid}`), "the app's DevTools socket");
  await run('adb', ['forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:webview_devtools_remote_${appPid}`]);
  page = await connectToPage(DEVTOOLS_PORT);

  const windowInsets = await adbShell('dumpsys', 'window');
  appTopPx = Number(windowInsets.match(/statusBars frame=\[0,0\]\[\d+,(\d+)\]/)?.[1]);
  const appBottomPx = Number(windowInsets.match(/navigationBars frame=\[0,(\d+)\]/)?.[1]);
  if (!appTopPx || !appBottomPx) {
    throw new Error("Couldn't find the status and navigation bars (adb shell dumpsys window)");
  }
  appHeightPx = appBottomPx - appTopPx;
  await mkdir(mediaDir, { recursive: true });
  await mkdir(workDir, { recursive: true });
}

/** A new user's first steps: onboarding with its defaults (dark theme, breathing northern lights), then the demo
 *  project, ending on its check list. */
export async function addDemoProject() {
  // 1. Onboarding: tap "Let's go".
  await tapUntil(elementWithText('button', "Let's go"), elementWithText('button', 'No key yet? Try the demo'), "onboarding's Let's go");
  // 2. First project form: tap "No key yet? Try the demo", which fills in the API key "demo".
  await tapUntil(elementWithText('button', 'No key yet? Try the demo'), "document.querySelector('input[placeholder=\"Paste API key\"]')?.value === 'demo'", 'Try the demo');
  // 3. Tap "Add project": the check list opens with the demo's 6 checks.
  await tapUntil(elementWithText('button', 'Add project'), "document.querySelectorAll('.check-row').length >= 6", 'Add project');
}

/** Disconnect from the app; it stays open on the emulator. */
export async function closeApp() {
  page.close();
  await run('adb', ['forward', '--remove', `tcp:${DEVTOOLS_PORT}`]);
}

// ---------------------------------------------------- moving around the app

export function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** A page expression for the first element matching `selector` whose text starts with `text`. */
export function elementWithText(selector, text) {
  return `[...document.querySelectorAll(${JSON.stringify(selector)})].find((element) => element.textContent.trim().startsWith(${JSON.stringify(text)}))`;
}

/** The same, for an element whose text includes `text` anywhere (a ping row starts with its type, e.g. "OK"). */
export function elementContainingText(selector, text) {
  return `[...document.querySelectorAll(${JSON.stringify(selector)})].find((element) => element.textContent.includes(${JSON.stringify(text)}))`;
}

/** Wait (up to 20 s) until a page expression is true. */
export async function waitFor(pageCondition, description) {
  await waitUntil(async () => page.evaluate(`!!(${pageCondition})`), description);
}

/** Go to one of the app's routes (it uses hash routes) and scroll to the top. */
export async function showRoute(hash) {
  await page.evaluate(`location.hash = ${JSON.stringify(hash)}; window.scrollTo(0, 0)`);
}

/** Tap an element where it shows on screen: scrolled into view, then its centre in screen pixels. The app is drawn
 *  below the status bar, so the app's top is added to the page's coordinates. */
export async function tap(elementExpression, description) {
  await waitFor(elementExpression, description);
  const centre = await page.evaluate(`(() => {
    const element = ${elementExpression};
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.width / 2) * devicePixelRatio, y: (rect.top + rect.height / 2) * devicePixelRatio };
  })()`);
  await pause(300); // let the scroll finish before tapping
  await run('adb', ['shell', 'input', 'tap', String(Math.round(centre.x)), String(Math.round(centre.y + appTopPx))]);
}

/** Tap until `resultCondition` holds: a tap while the screen is still settling (a new page, an animation) can miss. */
export async function tapUntil(elementExpression, resultCondition, description) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await tap(elementExpression, description);
    for (let check = 0; check < 15; check++) {
      await pause(200);
      if (await page.evaluate(`!!(${resultCondition})`)) {
        return;
      }
    }
  }
  throw new Error(`Tapping ${description} didn't work`);
}

/** Pick `optionValue` in a dropdown, scrolled into view first. Set from the page rather than tapped: Android shows a
 *  dropdown's options in a dialog outside the page. React tracks the value itself, so it's set through the
 *  element's own setter and announced with a change event, as a real pick would be. */
export async function chooseOption(selectExpression, optionValue, description) {
  await waitFor(selectExpression, description);
  await page.evaluate(`(() => {
    const select = ${selectExpression};
    select.scrollIntoView({ block: 'center' });
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(optionValue)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

/** Android's Back button, as on the phone. */
export async function pressBack() {
  await run('adb', ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
}

// ------------------------------------------------------- screenshots, video

/** Save the app's part of the screen as docs/media/<fileName>: the whole screen goes to the work dir, then the copy
 *  in docs/media/ is cropped to the app, without the status and navigation bars. */
export async function screenshot(fileName) {
  const screen = await run('adb', ['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
  await writeFile(`${workDir}/${fileName}`, screen);
  await run('ffmpeg', ['-v', 'error', '-y', '-i', `${workDir}/${fileName}`, '-vf', cropToApp(), `${mediaDir}/${fileName}`]);
  console.log(`    docs/media/${fileName}`);
}

/** Start recording the whole screen for `seconds` (at its full size, so cropping is in screen pixels). Returns a
 *  promise that ends once the recording is in the work dir as <fileName>. */
export function recordScreen(seconds, fileName) {
  const recording = spawn('adb', ['shell', 'screenrecord', '--time-limit', String(seconds), '--bit-rate', '4000000', `/sdcard/${fileName}`]);
  return new Promise((resolve) => recording.on('exit', resolve)).then(() => run('adb', ['pull', `/sdcard/${fileName}`, `${workDir}/${fileName}`]));
}

/** Turn a recording in the work dir into docs/media/<gifName>, an animated GIF, which GitHub plays inline: cropped
 *  to the app, then 360 px wide, 12 fps (or `fps`) and one 128-colour palette for the whole clip, so text stays
 *  readable at about 2 MB for 15 seconds. */
export async function makeGif(recordingFileName, gifName, { fps = 12 } = {}) {
  await run('ffmpeg', ['-v', 'error', '-y', '-i', `${workDir}/${recordingFileName}`, '-loop', '0', '-vf',
    `${cropToApp()},fps=${fps},scale=360:-1:flags=lanczos,split[frames][palette_source];[palette_source]palettegen=max_colors=128:stats_mode=diff[palette];[frames][palette]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    `${mediaDir}/${gifName}`]);
  console.log(`    docs/media/${gifName}`);
}

// ------------------------------------------------------------------ plumbing

function cropToApp() {
  return `crop=iw:${appHeightPx}:0:${appTopPx}`;
}

async function run(command, args, options = {}) {
  // `dumpsys window` and a full-size PNG are well over execFile's 1 MB default.
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024, ...options });
  return stdout;
}

function adbShell(...args) {
  return run('adb', ['shell', ...args]);
}

/** Wait (up to 20 s) until `check` resolves to true. A check that fails (e.g. the page still starting) counts as no. */
async function waitUntil(check, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check().catch(() => false)) {
      return;
    }
    await pause(200);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

/** A minimal Chrome DevTools Protocol client for the app's page: evaluate JavaScript in it. */
async function connectToPage(port) {
  let pageTarget;
  await waitUntil(async () => {
    const targets = await (await fetch(`http://localhost:${port}/json`)).json();
    pageTarget = targets.find((target) => target.type === 'page');
    return !!pageTarget;
  }, "the app's page");
  const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let lastMessageId = 0;
  const pendingReplies = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    pendingReplies.get(message.id)?.(message);
    pendingReplies.delete(message.id);
  };
  async function evaluate(expression) {
    const messageId = ++lastMessageId;
    const reply = await new Promise((resolve) => {
      pendingReplies.set(messageId, resolve);
      socket.send(JSON.stringify({ id: messageId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    const exception = reply.result?.exceptionDetails;
    if (exception) {
      throw new Error(`In the page: ${exception.exception?.description ?? exception.text}`);
    }
    return reply.result?.result?.value;
  }
  return { evaluate, close: () => socket.close() };
}
