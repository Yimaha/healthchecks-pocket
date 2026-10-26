// The ping body's text size, which the page's A− / A+ buttons and a pinch change, and onboarding sets.

/** Ping body text sizes (px): fine steps around the default, bigger ones up
 *  to 40. A− / A+ move one step; a pinch ends on the nearest. */
export const TEXT_SIZES = [8, 10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];
export const DEFAULT_TEXT_SIZE = 13;

export function snapSize(px: number): number {
  return TEXT_SIZES.reduce((best, size) => (Math.abs(size - px) < Math.abs(best - px) ? size : best));
}

/** Text size while pinching: the starting size scaled by how far the
 *  fingers moved apart, within the smallest and largest step. */
export function pinchSize(startSize: number, startDistance: number, distance: number): number {
  const smallest = TEXT_SIZES[0];
  const largest = TEXT_SIZES[TEXT_SIZES.length - 1];
  if (startDistance <= 0) {
    return startSize;
  }
  return Math.min(largest, Math.max(smallest, (startSize * distance) / startDistance));
}
