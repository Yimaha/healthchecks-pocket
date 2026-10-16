import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_HEADER_BYTES, readImageDimensions } from '../../src/core/imageSize';
import { decodeImage, ImageTooLarge } from '../../src/ui/imageTools';

/** Bytes from numbers and ASCII strings, in order. */
const bytesOf = (...parts: (number | string)[]) => new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((character) => character.charCodeAt(0)) : [part])));
const uint32BE = (value: number) => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const uint16BE = (value: number) => [value >>> 8, value & 0xff];
const uint16LE = (value: number) => [value & 0xff, value >>> 8];
const uint32LE = (value: number) => uint32BE(value).reverse();

const pngHeader = (width: number, height: number) => bytesOf(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, ...uint32BE(13), 'IHDR', ...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0);

describe('readImageDimensions', () => {
  it('reads a PNG', () => expect(readImageDimensions(pngHeader(30_000, 20_000))).toEqual({ width: 30_000, height: 20_000 }));

  it('reads a JPEG, past its EXIF data, its tables and a fill byte, to the start of frame', () => {
    const exifSegment = [0xff, 0xe1, ...uint16BE(2 + 1000), ...new Array(1000).fill(0)];
    const huffmanTable = [0xff, 0xc4, ...uint16BE(2 + 3), 0, 0, 0]; // C4 is in the SOF range but isn't one
    const startOfFrame = [0xff, 0xff, 0xc2, ...uint16BE(17), 8, ...uint16BE(12_240), ...uint16BE(16_320), 3];
    expect(readImageDimensions(bytesOf(0xff, 0xd8, ...exifSegment, ...huffmanTable, ...startOfFrame, ...new Array(9).fill(0))))
      .toEqual({ width: 16_320, height: 12_240 });
  });

  it('reads a GIF', () => expect(readImageDimensions(bytesOf('GIF89a', ...uint16LE(640), ...uint16LE(480), 0, 0, 0))).toEqual({ width: 640, height: 480 }));

  it('reads a BMP, top-down or OS/2', () => {
    expect(readImageDimensions(bytesOf('BM', ...new Array(12).fill(0), ...uint32LE(40), ...uint32LE(800), ...uint32LE(-600 >>> 0), 1, 0)))
      .toEqual({ width: 800, height: 600 });
    expect(readImageDimensions(bytesOf('BM', ...new Array(12).fill(0), ...uint32LE(12), ...uint16LE(300), ...uint16LE(200), 1, 0)))
      .toEqual({ width: 300, height: 200 });
  });

  it('reads the three kinds of WebP', () => {
    const riff = (chunkType: string, ...chunk: number[]) => bytesOf('RIFF', 0, 0, 0, 0, 'WEBP', chunkType, 0, 0, 0, 0, ...chunk);
    expect(readImageDimensions(riff('VP8 ', 0, 0, 0, 0x9d, 0x01, 0x2a, ...uint16LE(1024), ...uint16LE(768))))
      .toEqual({ width: 1024, height: 768 });
    const packedSizes = (1999 & 0x3fff) | ((2999 & 0x3fff) << 14);
    expect(readImageDimensions(riff('VP8L', 0x2f, ...uint32LE(packedSizes >>> 0)))).toEqual({ width: 2000, height: 3000 });
    expect(readImageDimensions(riff('VP8X', 0, 0, 0, 0, 0x3f, 0x9c, 0x00, 0x1f, 0x4e, 0x00))).toEqual({ width: 40_000, height: 20_000 });
  });

  it('reads an AVIF, taking the largest size of a gridded one', () => {
    const ispe = (width: number, height: number) => [...uint32BE(20), 'ispe', 0, 0, 0, 0, ...uint32BE(width), ...uint32BE(height)];
    expect(readImageDimensions(bytesOf(...uint32BE(24), 'ftypavif', 0, 0, 0, 0, 'mif1avif', ...ispe(512, 512), ...ispe(12_000, 9_000), ...ispe(512, 512))))
      .toEqual({ width: 12_000, height: 9_000 });
  });

  it('gives up on other files and on headers cut short', () => {
    expect(readImageDimensions(bytesOf('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>'))).toBeUndefined();
    expect(readImageDimensions(bytesOf(0, 0, 1, 0, 1, 0, 0, 0))).toBeUndefined(); // ICO
    expect(readImageDimensions(pngHeader(10, 10).subarray(0, 18))).toBeUndefined();
    expect(readImageDimensions(bytesOf(0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0))).toBeUndefined();
    expect(readImageDimensions(new Uint8Array())).toBeUndefined();
  });

  it('reads enough of a file for a JPEG with a big EXIF thumbnail', () => expect(IMAGE_HEADER_BYTES).toBeGreaterThanOrEqual(256 * 1024));
});

describe('decodeImage refuses huge images before decoding them', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['a PNG of 30000 × 20000', new File([pngHeader(30_000, 20_000)], 'huge.png', { type: 'image/png' }), 'This image is too large (30000 × 20000, 600 megapixels). Use one up to 70 megapixels, e.g. a screenshot of it.'],
    ['a 60 MB file', new File([new Uint8Array(60 * 1024 * 1024)], 'huge.svg', { type: 'image/svg+xml' }), 'This image is too large (60 MB). Use one up to 50 MB, e.g. a screenshot of it.'],
  ])('%s', async (_description, file, message) => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const thrown = await decodeImage(file).catch((error) => error);
    expect(thrown).toBeInstanceOf(ImageTooLarge);
    expect(thrown.message).toBe(message);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('decodes a 64-megapixel photo', async () => {
    const createImageBitmap = vi.fn().mockResolvedValue({ width: 9248, height: 6936, close() {} });
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    // jsdom has no canvas drawing, so decoding stops at the canvas; it got past the size check.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(decodeImage(new File([pngHeader(9248, 6936)], 'camera.png', { type: 'image/png' }))).rejects.not.toBeInstanceOf(ImageTooLarge);
    expect(createImageBitmap).toHaveBeenCalled();
  });
});
