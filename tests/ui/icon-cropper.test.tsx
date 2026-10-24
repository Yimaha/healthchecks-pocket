// The cropper for an uploaded icon on its own: dragging the square, its corner and a pinch, in the picture's own
// pixels. (Uploading and saving through the icon picker: icons.test.tsx.)

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Box } from '@/core/crop';
import { IconCropper } from '@/ui/IconCropper';
import type { DecodedImage } from '@/ui/imageTools';

// A 400 x 300 picture shown 200 px wide: one screen pixel is two of the picture's.
const PICTURE: DecodedImage = { source: document.createElement('canvas'), width: 400, height: 300 };
const SHOWN_WIDTH = 200;

let savedBoxes: Box[];
let cancelCount: number;
beforeEach(() => {
  savedBoxes = [];
  cancelCount = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(SHOWN_WIDTH);
});

function renderCropper() {
  render(<IconCropper image={PICTURE} onSave={(box) => savedBoxes.push(box)} onCancel={() => cancelCount++} />);
  return { cropSquare: screen.getByRole('slider', { name: 'Crop area' }), resizeHandle: screen.getByLabelText('Resize') };
}

/** The square as "Use this icon" saves it. */
function savedBox() {
  fireEvent.click(screen.getByRole('button', { name: 'Use this icon' }));
  return savedBoxes.at(-1);
}

/** One finger (pointer) down on `element` at (x, y), moved through `moves`, then lifted (or cancelled). */
function drag(element: Element, pointerId: number, [startX, startY]: [number, number], moves: [number, number][], end: 'up' | 'cancel' | 'none' = 'up') {
  fireEvent.pointerDown(element, { pointerId, clientX: startX, clientY: startY });
  for (const [clientX, clientY] of moves) fireEvent.pointerMove(element, { pointerId, clientX, clientY });
  if (end === 'up') fireEvent.pointerUp(element, { pointerId });
  if (end === 'cancel') fireEvent.pointerCancel(element, { pointerId });
}

describe('IconCropper', () => {
  it('draws the picture on its canvas and starts with the largest centred square, sized to the picture on screen', () => {
    const drawnPictures: unknown[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: (picture: unknown) => drawnPictures.push(picture) } as unknown as CanvasRenderingContext2D);
    const { cropSquare } = renderCropper();
    expect(drawnPictures).toEqual([PICTURE.source]);
    expect([cropSquare.style.left, cropSquare.style.top, cropSquare.style.width]).toEqual(['25px', '0px', '150px']); // 50, 0 and 300 of the picture's pixels
    expect(savedBox()).toEqual({ x: 50, y: 0, size: 300 });
  });

  it('dragging the square moves it, in the picture\'s pixels, and keeps it inside the picture', () => {
    const { cropSquare } = renderCropper();
    drag(cropSquare, 1, [100, 100], [[95, 100], [90, 100]]);
    expect(savedBox()).toEqual({ x: 30, y: 0, size: 300 }); // 10 screen pixels left: 20 of the picture's
    drag(cropSquare, 1, [100, 100], [[300, 300]]);
    expect(savedBox()).toEqual({ x: 100, y: 0, size: 300 }); // no further than the right edge
  });

  it('a lifted or cancelled finger no longer moves it', () => {
    const { cropSquare } = renderCropper();
    drag(cropSquare, 1, [100, 100], [[90, 100]], 'up');
    fireEvent.pointerMove(cropSquare, { pointerId: 1, clientX: 50, clientY: 100 });
    drag(cropSquare, 2, [100, 100], [[95, 100]], 'cancel');
    fireEvent.pointerMove(cropSquare, { pointerId: 2, clientX: 50, clientY: 100 });
    expect(savedBox()).toEqual({ x: 20, y: 0, size: 300 }); // 20 + 10 of the picture's pixels left, nothing after
  });

  it('dragging its corner resizes it from the top-left, by the larger of the two moves, at least 24 pixels', () => {
    const { resizeHandle } = renderCropper();
    drag(resizeHandle, 1, [175, 150], [[155, 140]]); // 20 screen pixels left, 10 up: smaller by 20 of the picture's
    expect(savedBox()).toEqual({ x: 50, y: 0, size: 280 });
    drag(resizeHandle, 1, [155, 140], [[0, 0]]);
    expect(savedBox()).toEqual({ x: 50, y: 0, size: 24 });
  });

  it('a two-finger pinch scales it around its centre', () => {
    const { cropSquare } = renderCropper();
    drag(cropSquare, 1, [50, 75], [], 'none');
    drag(cropSquare, 2, [150, 75], [[100, 75]], 'none'); // fingers 100 px apart, then 50: half the size
    expect(savedBox()).toEqual({ x: 125, y: 75, size: 150 });
    // One finger lifted: the other drags the square again.
    fireEvent.pointerUp(cropSquare, { pointerId: 2 });
    fireEvent.pointerMove(cropSquare, { pointerId: 1, clientX: 40, clientY: 75 });
    expect(savedBox()).toEqual({ x: 105, y: 75, size: 150 });
  });

  it('keys: Shift and an arrow moves it by 10% of the picture, = enlarges it like +, and other keys are left alone', () => {
    const { cropSquare } = renderCropper();
    fireEvent.keyDown(cropSquare, { key: '-' });
    fireEvent.keyDown(cropSquare, { key: '-' });
    const shrunk = savedBox()!; // 272 px, centred: room to move sideways and a little up and down
    expect(fireEvent.keyDown(cropSquare, { key: 'ArrowRight', shiftKey: true })).toBe(false); // handled: no page scroll
    expect(savedBox()).toEqual({ ...shrunk, x: shrunk.x + 40 });
    fireEvent.keyDown(cropSquare, { key: 'ArrowLeft' });
    fireEvent.keyDown(cropSquare, { key: 'ArrowUp' });
    expect(savedBox()).toEqual({ ...shrunk, x: shrunk.x + 32, y: shrunk.y - 8 });
    fireEvent.keyDown(cropSquare, { key: 'ArrowDown' });
    expect(savedBox()).toEqual({ ...shrunk, x: shrunk.x + 32 });
    fireEvent.keyDown(cropSquare, { key: '=' });
    expect(savedBox()!.size).toBeCloseTo(shrunk.size * 1.05);
    expect(fireEvent.keyDown(cropSquare, { key: 'a' })).toBe(true);
    expect(fireEvent.keyDown(cropSquare, { key: 'Tab' })).toBe(true);
  });

  it('Cancel leaves without saving', () => {
    renderCropper();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancelCount).toBe(1);
    expect(savedBoxes).toEqual([]);
  });
});
