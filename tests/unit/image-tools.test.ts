import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cropToDataUrl, decodeImage, ImageTooLarge, UnsupportedImage, type DecodedImage } from '@/ui/pages/icon-picker/imageTools';

const fileOfBytes = (byteCount: number, name: string, type: string) => new File([new Uint8Array(byteCount)], name, { type });

describe('decodeImage refuses image files over 10 MB, whatever the format, before decoding them', () => {
  afterEach(() => vi.unstubAllGlobals());

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

// jsdom has no canvas: a 2D context that records what's drawn on which canvas stands in, and toDataURL says which
// formats it can encode.
interface Drawing {
  canvas: HTMLCanvasElement;
  smoothing: string;
  drawImageArguments: unknown[];
}
let drawings: Drawing[];
let encodesWebp: boolean;
beforeEach(() => {
  drawings = [];
  encodesWebp = true;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const context = {
      imageSmoothingQuality: 'low',
      drawImage: (...drawImageArguments: unknown[]) => drawings.push({ canvas: this, smoothing: context.imageSmoothingQuality, drawImageArguments }),
    };
    return context as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext']);
  // Like a browser: an image type it can't encode comes back as PNG.
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((imageType?: string) =>
    (imageType === 'image/webp' && encodesWebp ? 'data:image/webp;base64,V0VCUA==' : 'data:image/png;base64,UE5H'));
});

/** A decoded picture (ImageBitmap) of this size, noting whether it was released. */
function fakeBitmap(width: number, height: number) {
  return { width, height, closed: false, close() { this.closed = true; } };
}

/** An <img> that loads (or fails to) as soon as it's given a source, noting the source. */
function stubImageElement(loads: boolean) {
  const imageSources: string[] = [];
  vi.stubGlobal('Image', class {
    width = 0; // an SVG without a size of its own
    height = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(imageSource: string) {
      imageSources.push(imageSource);
      queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
    }
  });
  return imageSources;
}

describe('decodeImage', () => {
  it.each([['IMG_0001.HEIC', ''], ['IMG_0002.jpg', 'image/heic'], ['photo', 'image/heif']])('refuses HEIC and HEIF (%s, %j) without reading them', async (name, type) => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const thrown = await decodeImage(fileOfBytes(100, name, type)).catch((error) => error);
    expect(thrown).toBeInstanceOf(UnsupportedImage);
    expect(thrown.message).toBe("This image type isn't supported here. Try a JPEG or PNG.");
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('draws a camera photo, turned as the phone took it, at most 2048 px on its longest side, then releases the full-size one', async () => {
    const photo = fakeBitmap(4000, 3000);
    const createImageBitmap = vi.fn().mockResolvedValue(photo);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const decoded = await decodeImage(fileOfBytes(1000, 'photo.jpg', 'image/jpeg'));
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: 'from-image' });
    expect(decoded).toMatchObject({ width: 2048, height: 1536 });
    expect([decoded.source.width, decoded.source.height]).toEqual([2048, 1536]);
    expect(drawings).toEqual([{ canvas: decoded.source, smoothing: 'high', drawImageArguments: [photo, 0, 0, 2048, 1536] }]);
    expect(photo.closed).toBe(true);
  });

  it('keeps a small picture at its own size', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap(120, 80)));
    expect(await decodeImage(fileOfBytes(1000, 'logo.png', 'image/png'))).toMatchObject({ width: 120, height: 80 });
  });

  it('what createImageBitmap can\'t decode (SVG) loads as an <img> from a data: URL; one without a size is drawn at 512 px', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('not a bitmap', 'InvalidStateError')));
    const imageSources = stubImageElement(true);
    const decoded = await decodeImage(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' }));
    // Not a blob: URL, which Android's WebView won't show for a file from the photo picker.
    expect(imageSources).toEqual([`data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`]);
    expect(decoded).toMatchObject({ width: 512, height: 512 });
  });

  it('a file neither way can decode is an unsupported image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('not a bitmap', 'InvalidStateError')));
    stubImageElement(false);
    await expect(decodeImage(fileOfBytes(100, 'broken.png', 'image/png'))).rejects.toBeInstanceOf(UnsupportedImage);
  });

  it('a file that can\'t be read is an unsupported image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('not a bitmap', 'InvalidStateError')));
    vi.stubGlobal('FileReader', class {
      onerror: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onerror?.()); }
    });
    await expect(decodeImage(fileOfBytes(100, 'gone.png', 'image/png'))).rejects.toBeInstanceOf(UnsupportedImage);
  });

  it('any other failure while drawing it is an unsupported image too', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap(100, 100)));
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({ drawImage() { throw new TypeError('out of memory'); } } as unknown as CanvasRenderingContext2D);
    await expect(decodeImage(fileOfBytes(100, 'huge.png', 'image/png'))).rejects.toBeInstanceOf(UnsupportedImage);
  });
});

describe('cropToDataUrl', () => {
  const picture: DecodedImage = { source: document.createElement('canvas'), width: 400, height: 300 };

  it('draws the square on a 192 px canvas, smoothly, and encodes it as WebP', () => {
    expect(cropToDataUrl(picture, { x: 50, y: 10, size: 280 })).toBe('data:image/webp;base64,V0VCUA==');
    const [iconDrawing] = drawings;
    expect([iconDrawing.canvas.width, iconDrawing.canvas.height]).toEqual([192, 192]);
    expect(iconDrawing).toMatchObject({ smoothing: 'high', drawImageArguments: [picture.source, 50, 10, 280, 280, 0, 0, 192, 192] });
  });

  it('as PNG where WebP can\'t be encoded', () => {
    encodesWebp = false;
    expect(cropToDataUrl(picture, { x: 0, y: 0, size: 300 })).toBe('data:image/png;base64,UE5H');
  });
});
