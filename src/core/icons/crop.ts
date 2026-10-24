// The square crop box for an uploaded icon, in the image's own pixels.
// Pure, so the dragging and resizing rules are unit-tested.

export interface Box {
  x: number;
  y: number;
  size: number;
}

/** Output size of a cropped icon (px). */
export const ICON_PX = 192;
/** The crop box can't get smaller than this (image px), or the icon blurs. */
export const MIN_CROP = 24;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The largest square, centred. */
export function initialBox(width: number, height: number): Box {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

/** Dragged by (dx, dy), kept inside the image. */
export function moveBox(box: Box, deltaX: number, deltaY: number, width: number, height: number): Box {
  return { ...box, x: clamp(box.x + deltaX, 0, width - box.size), y: clamp(box.y + deltaY, 0, height - box.size) };
}

/** Resized from its bottom-right corner by `delta` (top-left stays), kept
 *  square, inside the image and at least MIN_CROP (or the whole image, if
 *  that's smaller). */
export function resizeBox(box: Box, delta: number, width: number, height: number): Box {
  const max = Math.min(width - box.x, height - box.y);
  return { ...box, size: clamp(box.size + delta, Math.min(MIN_CROP, max), max) };
}

/** Scaled around its centre (pinch), kept inside the image. */
export function scaleBox(box: Box, factor: number, width: number, height: number): Box {
  const size = clamp(box.size * factor, Math.min(MIN_CROP, width, height), Math.min(width, height));
  const centreX = box.x + box.size / 2;
  const centreY = box.y + box.size / 2;
  return { size, x: clamp(centreX - size / 2, 0, width - size), y: clamp(centreY - size / 2, 0, height - size) };
}
