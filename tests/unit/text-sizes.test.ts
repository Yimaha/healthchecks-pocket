import { describe, expect, it } from 'vitest';
import { pinchSize, snapSize } from '@/core/ping-body/textSizes';

describe('ping body text size', () => {
  it.each([[8, 8], [7, 8], [11, 10], [12.6, 13], [15, 14], [22, 20], [26, 24], [35, 32], [36, 32], [37, 40], [99, 40]])(
    'snapSize(%s) = %s (a tie goes to the smaller)', (px, out) => expect(snapSize(px)).toBe(out),
  );

  it('pinching scales the starting size by the finger distance, within 8-40', () => {
    expect(pinchSize(13, 100, 200)).toBe(26);
    expect(pinchSize(13, 100, 50)).toBe(8);
    expect(pinchSize(20, 100, 1000)).toBe(40);
    expect(pinchSize(13, 0, 50)).toBe(13);
  });
});
