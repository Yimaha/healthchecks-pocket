import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeImage, ImageTooLarge } from '../../src/ui/imageTools';

describe('decodeImage refuses image files over 10 MB, whatever the format, before decoding them', () => {
  afterEach(() => vi.unstubAllGlobals());

  const fileOfBytes = (byteCount: number, name: string, type: string) => new File([new Uint8Array(byteCount)], name, { type });

  it.each([['photo.jpg', 'image/jpeg'], ['drawing.svg', 'image/svg+xml'], ['unknown', '']])('%s', async (name, type) => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const thrown = await decodeImage(fileOfBytes(10 * 1024 * 1024 + 1, name, type)).catch((error) => error);
    expect(thrown).toBeInstanceOf(ImageTooLarge);
    expect(thrown.message).toBe('This image is too large. Use one up to 10 MB, e.g. a screenshot of it.');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('tries to decode a file of exactly 10 MB', async () => {
    const createImageBitmap = vi.fn().mockResolvedValue({ width: 4000, height: 3000, close() {} });
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    // jsdom can't draw on a canvas, so decoding stops there; it got past the size check.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(decodeImage(fileOfBytes(10 * 1024 * 1024, 'photo.jpg', 'image/jpeg'))).rejects.not.toBeInstanceOf(ImageTooLarge);
    expect(createImageBitmap).toHaveBeenCalled();
  });
});
