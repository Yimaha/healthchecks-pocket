import { useEffect, useRef } from 'react';
import { breathAt, createHeartRhythm, type HeartRhythm } from './ecgRhythm';

// The "Heartbeat monitor" background. This folder holds all of it (this
// component and its canvas drawing; ecgRhythm.ts, the maths) and is
// self-contained on purpose: only AppBackground uses the component, and
// nothing outside the folder should reach in.

/** A heartbeat trace drawn the way a bedside monitor draws it: a glowing
 *  point writes the line left to right, and the line fades out behind it.
 *  Nothing flashes: beats show only in the line's shape (no bursts of light,
 *  which some people find hard to look at). Decorative; for people who prefer
 *  reduced motion it draws one still trace. */
export function HeartbeatMonitor() {
  const layersRef = useRef<Partial<HeartbeatLayers>>({});
  useEffect(() => {
    const { trace, pen } = layersRef.current;
    const context = trace?.getContext('2d');
    if (!trace || !pen || !context) return; // no canvas (screen tests): nothing to draw
    return startHeartbeatMonitor({ trace, pen }, context);
  }, []);
  const layers = layersRef.current;
  return (
    <div className="heartbeat" aria-hidden="true">
      <canvas className="heartbeat-trace" ref={(element) => { layers.trace = element ?? undefined; }} />
      <div className="heartbeat-pen" ref={(element) => { layers.pen = element ?? undefined; }} />
    </div>
  );
}

/** The monitor's layers: the line is drawn on the canvas; the writing point is a CSS layer, moved with transform,
 *  which costs far less to change every frame than redrawing pixels. */
interface HeartbeatLayers {
  trace: HTMLCanvasElement;
  pen: HTMLDivElement;
}

/** Two samples per CSS pixel, so the narrow R spike's tip is never skipped between samples. */
const SAMPLES_PER_PX = 2;
/** Trace speed: one vmin per 2.8 s, so a phone in portrait shows about 3 beats per pass. */
const MS_PER_VMIN = 2_800;
/** The erase bar: the gap ahead of the writing point that wipes the previous pass. */
const ERASE_GAP_FRACTION = 0.06;
/** The drawn line dims in steps this far apart: small steps on every frame would get stuck at a faint ghost line,
 *  as the canvas rounds each pixel's opacity to 1/255. */
const FADE_STEP_MS = 50;
/** How much of the line's brightness is left when the point comes round to it again. */
const FADE_RESIDUAL = 0.06;
/** The baseline rises and falls with each breath by this much of an R spike (a pixel or two), as on a real ECG. */
const BASELINE_WANDER = 0.025;
/** Sharp enough on any phone; more only costs GPU time. */
const MAX_PIXEL_RATIO = 2;
/** After a stall (a slow frame, the app coming back), carry on rather than jump ahead. */
const MAX_FRAME_MS = 100;
const STILL_TRACE_ALPHA = 0.6;

/** Size, colour and timing of the monitor; returns a function that stops it. */
function startHeartbeatMonitor(layers: HeartbeatLayers, context: CanvasRenderingContext2D): () => void {
  const { trace, pen } = layers;
  const reducedMotionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const rhythm: HeartRhythm = createHeartRhythm(Math.random);
  let monitorMs = 0; // advances only while drawing, so the trace carries on where it was
  let lastFrameAt = 0;
  let frameRequest = 0;
  let msSinceFadeStep = 0;
  let lineColour = '#3ccf7e';

  // Layout, set by resizeToViewport(). The canvas covers only the band the trace moves in, not the whole screen.
  let widthPx = 0;
  let bandTopPx = 0; // where the canvas starts, from the top of the screen
  let bandHeightPx = 0;
  let baselineY = 0; // in the canvas
  let rHeightPx = 0;
  let lineWidthPx = 2;
  let pxPerMs = 1;
  let lastSampleNumber = 0; // counts every sample written; its x is (number / SAMPLES_PER_PX) modulo the width
  let lastPoint: { x: number; y: number } | null = null;

  const sampleStepMs = () => 1 / (pxPerMs * SAMPLES_PER_PX);
  const fadeMs = () => ((1 - ERASE_GAP_FRACTION) * widthPx) / pxPerMs;

  function readLineColour() {
    lineColour = getComputedStyle(trace).getPropertyValue('--heartbeat-line').trim() || lineColour;
  }

  function resizeToViewport() {
    widthPx = window.innerWidth;
    const heightPx = window.innerHeight;
    const vminPx = Math.min(widthPx, heightPx);
    pxPerMs = vminPx / MS_PER_VMIN;
    rHeightPx = vminPx * 0.17;
    lineWidthPx = Math.min(2.5, Math.max(1.5, vminPx * 0.005));
    // Near the bottom: below the check list on most phones, so the cards don't hide it. The band fits the tallest R
    // spike above the baseline and the S dip below it, with room for the line's glow.
    const screenBaselineY = heightPx * 0.86;
    const marginPx = lineWidthPx * 4;
    bandTopPx = Math.round(screenBaselineY - rHeightPx * 1.15 - marginPx);
    bandHeightPx = Math.round(rHeightPx * 1.5 + marginPx * 2);
    baselineY = screenBaselineY - bandTopPx;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    trace.style.top = `${bandTopPx}px`;
    trace.style.height = `${bandHeightPx}px`;
    trace.width = Math.round(widthPx * pixelRatio); // (resizing the canvas also clears it)
    trace.height = Math.round(bandHeightPx * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.lineJoin = 'round';
    context.lineCap = 'butt'; // round caps would overlap where one frame's piece of line meets the next, beading it
    // A new size starts a new, empty pass from where the point is now.
    lastSampleNumber = Math.floor(monitorMs / sampleStepMs());
    lastPoint = null;
  }

  /** The new samples since the last frame, from the rhythm, noting each R spike as the point passes it. */
  function takeNewSamples(): { x: number; y: number }[] {
    const stepMs = sampleStepMs();
    const targetSampleNumber = Math.floor(monitorMs / stepMs);
    const samples: { x: number; y: number }[] = [];
    // Never more than one pass: anything older would be wiped anyway.
    const passSamples = Math.ceil(widthPx * SAMPLES_PER_PX);
    for (let sampleNumber = Math.max(lastSampleNumber + 1, targetSampleNumber - passSamples + 1); sampleNumber <= targetSampleNumber; sampleNumber++) {
      const atMs = sampleNumber * stepMs;
      const voltage = rhythm.voltageAt(atMs) + BASELINE_WANDER * breathAt(atMs);
      const sample = { x: (sampleNumber / SAMPLES_PER_PX) % widthPx, y: baselineY - voltage * rHeightPx };
      samples.push(sample);
    }
    lastSampleNumber = targetSampleNumber;
    return samples;
  }

  /** Draw a piece of line through `samples`, continuing from the last point; a new piece starts at the left edge. */
  function strokeSamples(samples: { x: number; y: number }[], alpha: number) {
    const strokePiece = () => {
      // A wide, faint stroke under the line for its glow (shadowBlur is too slow on Android WebViews).
      context.lineWidth = lineWidthPx * 4;
      context.globalAlpha = alpha * 0.18;
      context.stroke();
      context.lineWidth = lineWidthPx;
      context.globalAlpha = alpha;
      context.stroke();
    };
    context.strokeStyle = lineColour;
    context.beginPath();
    if (lastPoint) context.moveTo(lastPoint.x, lastPoint.y);
    for (const sample of samples) {
      if (lastPoint && sample.x < lastPoint.x) {
        strokePiece(); // wrapped round: don't join the right edge to the left
        context.beginPath();
        context.moveTo(sample.x, sample.y);
      } else if (!lastPoint) context.moveTo(sample.x, sample.y);
      else context.lineTo(sample.x, sample.y);
      lastPoint = sample;
    }
    strokePiece();
    context.globalAlpha = 1;
  }

  /** Dim everything drawn so far, one step per FADE_STEP_MS, so it's nearly gone when the point comes round again. */
  function fadeDrawnLine(frameMs: number) {
    msSinceFadeStep += frameMs;
    if (msSinceFadeStep < FADE_STEP_MS) return;
    const keptBrightness = FADE_RESIDUAL ** (msSinceFadeStep / fadeMs());
    msSinceFadeStep = 0;
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = `rgba(0, 0, 0, ${1 - keptBrightness})`;
    context.fillRect(0, 0, widthPx, bandHeightPx);
    context.globalCompositeOperation = 'source-over';
  }

  /** Wipe the erase bar just ahead of the point (wrapping round to the left edge), taking the last of the old pass. */
  function wipeAheadOfPoint() {
    if (!lastPoint) return;
    const fromX = lastPoint.x + lineWidthPx * 2;
    const gapPx = widthPx * ERASE_GAP_FRACTION;
    context.clearRect(fromX, 0, gapPx, bandHeightPx);
    if (fromX + gapPx > widthPx) context.clearRect(0, 0, fromX + gapPx - widthPx, bandHeightPx);
  }

  /** Move the writing point to the end of the line. */
  function moveWritingPoint(breathBrightness: number) {
    if (lastPoint) pen.style.transform = `translate(${lastPoint.x}px, ${bandTopPx + lastPoint.y}px)`;
    pen.style.opacity = String(lastPoint ? breathBrightness : 0);
  }

  /** Reduced motion: one full pass, drawn once and left still, without the writing point. */
  function drawStillTrace() {
    context.clearRect(0, 0, widthPx, bandHeightPx);
    monitorMs += widthPx / pxPerMs;
    lastPoint = null;
    strokeSamples(takeNewSamples(), STILL_TRACE_ALPHA);
    pen.style.opacity = '0';
  }

  const animateFrame = (frameAt: number) => {
    const frameMs = Math.min(Math.max(0, frameAt - lastFrameAt), MAX_FRAME_MS);
    lastFrameAt = frameAt;
    monitorMs += frameMs;
    const breathBrightness = 0.88 + 0.12 * breathAt(monitorMs); // the whole trace brightens breathing in
    fadeDrawnLine(frameMs);
    strokeSamples(takeNewSamples(), breathBrightness);
    wipeAheadOfPoint();
    moveWritingPoint(breathBrightness);
    frameRequest = requestAnimationFrame(animateFrame);
  };

  const stopAnimating = () => {
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
  };

  /** Animate, or draw the still trace for reduced motion; nothing while the app is hidden. */
  const startOrRedraw = () => {
    if (reducedMotionQuery?.matches) {
      stopAnimating();
      drawStillTrace();
    } else if (document.hidden) stopAnimating();
    else if (!frameRequest) {
      lastFrameAt = performance.now();
      frameRequest = requestAnimationFrame(animateFrame);
    }
  };

  const onResize = () => {
    resizeToViewport();
    if (reducedMotionQuery?.matches) drawStillTrace();
  };
  // The line already drawn keeps its colour and fades out; new line comes in the new one.
  const onThemeChange = () => {
    readLineColour();
    if (reducedMotionQuery?.matches) drawStillTrace();
  };

  readLineColour();
  resizeToViewport();
  startOrRedraw();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', startOrRedraw);
  reducedMotionQuery?.addEventListener('change', startOrRedraw);
  // The theme is a data-theme attribute on <html> (theme.ts): recolour when it changes.
  const themeObserver = new MutationObserver(onThemeChange);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    stopAnimating();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', startOrRedraw);
    reducedMotionQuery?.removeEventListener('change', startOrRedraw);
    themeObserver.disconnect();
  };
}
