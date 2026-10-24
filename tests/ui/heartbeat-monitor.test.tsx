// The "Heartbeat monitor" background drawing on its canvas: jsdom has no canvas, so a 2D context that records each
// stroke, clear and fade stands in, and the test plays the animation frames itself. (The rhythm's maths:
// tests/unit/heartbeat-monitor.test.ts.)

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartbeatMonitor } from '@/ui/background/heartbeat-monitor/HeartbeatMonitor';

interface Point {
  x: number;
  y: number;
}
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** One stroke(): the pieces of line it drew (each from a moveTo), and how. */
interface Stroke {
  colour: string;
  alpha: number;
  width: number;
  compositing: string;
  pieces: Point[][];
}

/** A 2D context that records what's drawn on it. */
function recordingContext() {
  const drawing = { strokes: [] as Stroke[], clears: [] as Rect[], fades: [] as { fillStyle: string; compositing: string; area: Rect }[], transforms: [] as number[][] };
  let pathPieces: Point[][] = [];
  const context = {
    lineJoin: 'miter', lineCap: 'butt', lineWidth: 1, globalAlpha: 1, strokeStyle: '#000', fillStyle: '#000', globalCompositeOperation: 'source-over',
    setTransform: (...matrix: number[]) => drawing.transforms.push(matrix),
    beginPath: () => { pathPieces = []; },
    moveTo: (x: number, y: number) => { pathPieces.push([{ x, y }]); },
    lineTo: (x: number, y: number) => { pathPieces.at(-1)!.push({ x, y }); },
    stroke() {
      drawing.strokes.push({ colour: this.strokeStyle, alpha: this.globalAlpha, width: this.lineWidth, compositing: this.globalCompositeOperation, pieces: pathPieces.map((piece) => [...piece]) });
    },
    clearRect: (x: number, y: number, width: number, height: number) => drawing.clears.push({ x, y, width, height }),
    fillRect(x: number, y: number, width: number, height: number) {
      drawing.fades.push({ fillStyle: this.fillStyle, compositing: this.globalCompositeOperation, area: { x, y, width, height } });
    },
  };
  return { context, drawing };
}

// A phone in portrait: 360 x 800 CSS pixels at 3 device pixels each.
const SCREEN_WIDTH = 360;
const SCREEN_HEIGHT = 800;
const LIGHT_LINE = '#1f9d55';
const DARK_LINE = '#3ccf7e';

let recording: ReturnType<typeof recordingContext>;
/** The animation frames the monitor has asked for, by id, and the clock they're played with (performance.now()). */
const requestedFrames = new Map<number, FrameRequestCallback>();
let lastFrameId = 0;
let clockMs = 0;
let documentHidden = false;

beforeEach(() => {
  recording = recordingContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recording.context as unknown as CanvasRenderingContext2D);
  requestedFrames.clear();
  clockMs = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
  vi.stubGlobal('requestAnimationFrame', (frameCallback: FrameRequestCallback) => {
    requestedFrames.set(++lastFrameId, frameCallback);
    return lastFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (frameId: number) => requestedFrames.delete(frameId));
  vi.stubGlobal('innerWidth', SCREEN_WIDTH);
  vi.stubGlobal('innerHeight', SCREEN_HEIGHT);
  vi.stubGlobal('devicePixelRatio', 3);
  documentHidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => documentHidden });
  // The line's colour in each theme, as src/index.css sets it.
  const themeColours = document.createElement('style');
  themeColours.id = 'theme-colours';
  themeColours.textContent = `:root { --heartbeat-line: ${LIGHT_LINE}; } :root[data-theme="dark"] { --heartbeat-line: ${DARK_LINE}; }`;
  document.head.append(themeColours);
});

afterEach(() => {
  delete (document as { hidden?: boolean }).hidden; // back to jsdom's own
  document.getElementById('theme-colours')?.remove();
});

/** Play the animation for `durationMs`, a frame every `frameMs` (60 Hz by default), as the browser would. */
function playFrames(durationMs: number, frameMs = 1000 / 60) {
  for (let playedMs = 0; playedMs < durationMs - 0.001; playedMs += frameMs) {
    clockMs += frameMs;
    const dueFrames = [...requestedFrames.values()];
    requestedFrames.clear();
    for (const frameCallback of dueFrames) frameCallback(clockMs);
  }
}

/** "Prefers reduced motion", which the test can change while the monitor runs. */
function stubReducedMotion(reduced: boolean) {
  const reducedMotionQuery = Object.assign(new EventTarget(), { matches: reduced, media: '(prefers-reduced-motion: reduce)' });
  vi.stubGlobal('matchMedia', (mediaQuery: string) => (mediaQuery === reducedMotionQuery.media ? reducedMotionQuery : null));
  return (nowReduced: boolean) => {
    reducedMotionQuery.matches = nowReduced;
    act(() => { reducedMotionQuery.dispatchEvent(new Event('change')); });
  };
}

const traceCanvas = () => document.querySelector<HTMLCanvasElement>('.heartbeat-trace')!;
const writingPoint = () => document.querySelector<HTMLElement>('.heartbeat-pen')!;
/** The line's own strokes, without the glow drawn under each (4 times as wide). */
const lineStrokes = () => recording.drawing.strokes.filter((_stroke, strokeIndex) => strokeIndex % 2 === 1);
const lastLinePoint = () => lineStrokes().at(-1)!.pieces.at(-1)!.at(-1)!;
const bandTop = () => parseFloat(traceCanvas().style.top);
/** The x of every point in these strokes. */
const xsOf = (strokes: Stroke[]) => strokes.flatMap((stroke) => stroke.pieces.flat().map((point) => point.x));

describe('HeartbeatMonitor', () => {
  it('draws in a band near the bottom of the screen, at up to 2 device pixels per CSS pixel', () => {
    render(<HeartbeatMonitor />);
    const bandHeight = parseFloat(traceCanvas().style.height);
    expect(bandTop()).toBeGreaterThan(SCREEN_HEIGHT * 0.7); // below the check list on most phones
    expect(bandTop() + bandHeight).toBeLessThan(SCREEN_HEIGHT);
    // A 3x screen gets a 2x canvas: sharp enough, and a third of the pixels to fill.
    expect([traceCanvas().width, traceCanvas().height]).toEqual([SCREEN_WIDTH * 2, bandHeight * 2]);
    expect(recording.drawing.transforms).toEqual([[2, 0, 0, 2, 0, 0]]);
  });

  it('writes the line left to right at one screen width (in portrait) per 2.8 s, the writing point at its end', () => {
    render(<HeartbeatMonitor />);
    expect(requestedFrames.size).toBe(1);
    playFrames(1_400);
    expect(Math.abs(lastLinePoint().x - SCREEN_WIDTH / 2)).toBeLessThanOrEqual(0.5); // (a sample every half pixel)
    expect(writingPoint().style.transform).toBe(`translate(${lastLinePoint().x}px, ${bandTop() + lastLinePoint().y}px)`);
    // Brighter breathing in, never fully dim.
    expect(Number(writingPoint().style.opacity)).toBeGreaterThanOrEqual(0.76);
    expect(Number(writingPoint().style.opacity)).toBeLessThanOrEqual(1);
  });

  it('draws the line with a faint glow under it: a stroke 4 times as wide, at 18% of its opacity', () => {
    render(<HeartbeatMonitor />);
    playFrames(500);
    const { strokes } = recording.drawing;
    expect(strokes.length).toBeGreaterThan(10);
    for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex += 2) {
      const [glow, line] = [strokes[strokeIndex], strokes[strokeIndex + 1]];
      expect(glow.width).toBeCloseTo(line.width * 4);
      expect(glow.alpha).toBeCloseTo(line.alpha * 0.18);
      expect(glow.pieces).toEqual(line.pieces);
      expect(line).toMatchObject({ colour: LIGHT_LINE, compositing: 'source-over' });
    }
  });

  it('at the right edge carries on from the left, without joining the two', () => {
    render(<HeartbeatMonitor />);
    playFrames(4_000); // more than one pass
    const linePieces = lineStrokes().flatMap((stroke) => stroke.pieces);
    for (const linePiece of linePieces) {
      const xs = linePiece.map((point) => point.x);
      expect(xs).toEqual([...xs].sort((left, right) => left - right));
    }
    expect(linePieces.some((linePiece) => linePiece[0].x < 1)).toBe(true);
    expect(lastLinePoint().x).toBeLessThan(SCREEN_WIDTH / 2);
  });

  it('fades what it drew, in steps at least 50 ms apart, to about 6% when the point comes round again', () => {
    render(<HeartbeatMonitor />);
    const fadeStepCount = (durationMs: number) => {
      const fadesBefore = recording.drawing.fades.length;
      playFrames(durationMs, 20);
      return recording.drawing.fades.length - fadesBefore;
    };
    expect(fadeStepCount(40)).toBe(0); // two 20 ms frames: not yet
    expect(fadeStepCount(20)).toBe(1);
    // What's left of a line once the point comes round to it: a screen width less the 6% erase bar, at 2.8 s a width.
    const passMs = 0.94 * 2_800;
    const fadesBefore = recording.drawing.fades.length;
    playFrames(passMs);
    const passFades = recording.drawing.fades.slice(fadesBefore);
    const brightnessLeft = passFades.reduce((brightness, fade) => brightness * (1 - Number(fade.fillStyle.match(/rgba\(0, 0, 0, ([\d.e-]+)\)/)![1])), 1);
    expect(brightnessLeft).toBeGreaterThan(0.05);
    expect(brightnessLeft).toBeLessThan(0.075);
    for (const fade of passFades) {
      expect(fade).toMatchObject({ compositing: 'destination-out', area: { x: 0, y: 0, width: SCREEN_WIDTH } });
    }
    expect(recording.context.globalCompositeOperation).toBe('source-over'); // so the line that follows is drawn, not erased
  });

  it('clears a gap ahead of the writing point, taking the start of the line from the left edge when near the right', () => {
    render(<HeartbeatMonitor />);
    playFrames(1_000);
    const eraseBar = recording.drawing.clears.at(-1)!;
    expect(eraseBar.x).toBeGreaterThan(lastLinePoint().x);
    expect(eraseBar.x - lastLinePoint().x).toBeLessThan(5);
    expect(eraseBar.width).toBeCloseTo(SCREEN_WIDTH * 0.06);
    playFrames(1_650); // the point is in the last 6% of the screen
    const [rightEraseBar, leftEraseBar] = recording.drawing.clears.slice(-2);
    expect(rightEraseBar.x + rightEraseBar.width).toBeGreaterThan(SCREEN_WIDTH);
    expect(leftEraseBar).toMatchObject({ x: 0, width: rightEraseBar.x + rightEraseBar.width - SCREEN_WIDTH });
  });

  it('after a stall (a slow frame, the app coming back) carries on, moving at most 100 ms on', () => {
    render(<HeartbeatMonitor />);
    playFrames(500);
    const xBefore = lastLinePoint().x;
    playFrames(5_000, 5_000);
    const movedPx = lastLinePoint().x - xBefore;
    expect(Math.abs(movedPx - (100 * SCREEN_WIDTH) / 2_800)).toBeLessThanOrEqual(0.5);
  });

  it('stops while the app is hidden, and carries on where it was when it\'s back', () => {
    render(<HeartbeatMonitor />);
    playFrames(500);
    documentHidden = true;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(requestedFrames.size).toBe(0);
    const strokesWhileShown = recording.drawing.strokes.length;
    clockMs += 60_000;
    const xWhenHidden = lastLinePoint().x;
    documentHidden = false;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(recording.drawing.strokes).toHaveLength(strokesWhileShown);
    expect(requestedFrames.size).toBe(1);
    playFrames(1000 / 60);
    expect(lastLinePoint().x - xWhenHidden).toBeLessThan(3);
  });

  it('follows the theme: new line in the dark theme\'s colour, while the line already drawn fades out', async () => {
    render(<HeartbeatMonitor />);
    playFrames(200);
    await act(async () => { document.documentElement.dataset.theme = 'dark'; });
    const strokesBefore = recording.drawing.strokes.length;
    playFrames(200);
    expect(recording.drawing.strokes.slice(0, strokesBefore).map((stroke) => stroke.colour)).not.toContain(DARK_LINE);
    expect(new Set(recording.drawing.strokes.slice(strokesBefore).map((stroke) => stroke.colour))).toEqual(new Set([DARK_LINE]));
  });

  it('a new screen size starts a new pass at the new size, from where the point is now', () => {
    render(<HeartbeatMonitor />);
    playFrames(500);
    const lineEndAtOldSize = lastLinePoint();
    vi.stubGlobal('innerWidth', 400);
    vi.stubGlobal('innerHeight', 900);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(traceCanvas().width).toBe(800);
    const strokesBefore = recording.drawing.strokes.length;
    playFrames(1000 / 60);
    const [firstPointAtNewSize] = recording.drawing.strokes[strokesBefore].pieces[0];
    expect(firstPointAtNewSize).not.toEqual(lineEndAtOldSize); // not joined to the line drawn at the old size
    expect(Math.abs(firstPointAtNewSize.x - (500 * 400) / 2_800)).toBeLessThanOrEqual(0.5); // 0.5 s in, at the new speed
  });

  describe('for people who prefer reduced motion', () => {
    it('draws one still trace across the screen, with no writing point and no animation', () => {
      stubReducedMotion(true);
      render(<HeartbeatMonitor />);
      expect(requestedFrames.size).toBe(0);
      for (const stillLine of lineStrokes()) expect(stillLine).toMatchObject({ alpha: 0.6, colour: LIGHT_LINE });
      expect(Math.min(...xsOf(lineStrokes()))).toBeLessThan(1);
      expect(Math.max(...xsOf(lineStrokes()))).toBeGreaterThan(SCREEN_WIDTH - 1);
      expect(writingPoint().style.opacity).toBe('0');
    });

    it('draws it again, at the new size or in the new theme\'s colour', async () => {
      stubReducedMotion(true);
      render(<HeartbeatMonitor />);
      /** The line strokes drawn while `change` runs. */
      const lineStrokesDrawnBy = async (change: () => void) => {
        const strokesBefore = recording.drawing.strokes.length;
        await act(async () => change());
        return recording.drawing.strokes.slice(strokesBefore).filter((_stroke, strokeIndex) => strokeIndex % 2 === 1);
      };
      vi.stubGlobal('innerWidth', 800);
      const stillLineAtNewSize = await lineStrokesDrawnBy(() => window.dispatchEvent(new Event('resize')));
      expect(Math.max(...xsOf(stillLineAtNewSize))).toBeGreaterThan(799);
      const stillLineInDarkTheme = await lineStrokesDrawnBy(() => { document.documentElement.dataset.theme = 'dark'; });
      expect(stillLineInDarkTheme.length).toBeGreaterThan(0);
      for (const stillLine of stillLineInDarkTheme) expect(stillLine).toMatchObject({ colour: DARK_LINE, alpha: 0.6 });
      expect(requestedFrames.size).toBe(0);
    });

    it('switched on while it runs: stops and draws the still trace; switched off: animates again', () => {
      const setReducedMotion = stubReducedMotion(false);
      render(<HeartbeatMonitor />);
      playFrames(500);
      setReducedMotion(true);
      expect(requestedFrames.size).toBe(0);
      expect(lineStrokes().at(-1)!.alpha).toBe(0.6);
      setReducedMotion(false);
      expect(requestedFrames.size).toBe(1);
    });
  });

  it('once removed, draws nothing more and asks for no more frames', async () => {
    const setReducedMotion = stubReducedMotion(false);
    const { unmount } = render(<HeartbeatMonitor />);
    playFrames(200);
    unmount();
    expect(requestedFrames.size).toBe(0);
    const strokesBefore = recording.drawing.strokes.length;
    act(() => {
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    setReducedMotion(true);
    await act(async () => { document.documentElement.dataset.theme = 'dark'; });
    expect(recording.drawing.strokes).toHaveLength(strokesBefore);
    expect(requestedFrames.size).toBe(0);
  });

  it('without a 2D canvas, draws nothing and asks for no frames', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    render(<HeartbeatMonitor />);
    expect(requestedFrames.size).toBe(0);
    expect(document.querySelector('.heartbeat')!.getAttribute('aria-hidden')).toBe('true');
  });
});
