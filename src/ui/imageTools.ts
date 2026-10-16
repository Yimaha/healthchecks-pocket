import { ICON_PX, type Box } from '../core/crop';
import { IMAGE_HEADER_BYTES, readImageDimensions } from '../core/imageSize';

// Turning an uploaded file into a picture to crop, and the crop into the
// stored icon. Browser-only (canvas); screen tests stub this module.

/** HEIC/HEIF (and anything else the browser can't draw). */
export class UnsupportedImage extends Error {
  constructor() {
    super("This image type isn't supported here. Try a JPEG or PNG.");
  }
}

/** An image too big to decode safely: decoding it could crash the WebView, which closes the app. */
export class ImageTooLarge extends Error {
  constructor(sizeText: string, limitText: string) {
    super(`This image is too large (${sizeText}). Use one up to ${limitText}, e.g. a screenshot of it.`);
  }
}

/** Decoded, an image takes 4 bytes a pixel: 70 MP is about 280 MB, enough for a 64 MP phone camera's photos. */
const MAX_IMAGE_PIXELS = 70_000_000;
/** For files whose size in pixels can't be read before decoding (SVG, ICO, unusual headers). */
const MAX_IMAGE_FILE_BYTES = 50 * 1024 * 1024;

/** Throws ImageTooLarge for a file too big to decode, judged from its size and its header, before decoding. */
async function rejectHugeImage(file: File): Promise<void> {
  const megabytes = (byteCount: number) => `${Math.round(byteCount / (1024 * 1024))} MB`;
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new ImageTooLarge(megabytes(file.size), megabytes(MAX_IMAGE_FILE_BYTES));
  const dimensions = readImageDimensions(new Uint8Array(await file.slice(0, IMAGE_HEADER_BYTES).arrayBuffer()));
  if (dimensions && dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    const megapixels = (pixelCount: number) => `${Math.round(pixelCount / 1_000_000)} megapixels`;
    throw new ImageTooLarge(`${dimensions.width} × ${dimensions.height}, ${megapixels(dimensions.width * dimensions.height)}`, megapixels(MAX_IMAGE_PIXELS));
  }
}

export interface DecodedImage {
  source: HTMLCanvasElement; // the picture, at most MAX_SIDE on its longest side
  width: number;
  height: number;
}

/** Big camera photos are scaled down first, so cropping doesn't use up memory. */
const MAX_SIDE = 2048;

/** Through a data: URL, not a blob: URL: Android's WebView won't show a blob
 *  URL of a file from the photo picker. */
function loadImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new UnsupportedImage());
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new UnsupportedImage());
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Any format the browser can draw: PNG, JPEG, WebP, GIF (first frame), BMP,
 *  AVIF, SVG, ICO. The phone's rotation (EXIF) is applied. Images too big to
 *  decode safely are refused first (ImageTooLarge). */
export async function decodeImage(file: File): Promise<DecodedImage> {
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw new UnsupportedImage();
  try {
    await rejectHugeImage(file);
    let picture: ImageBitmap | HTMLImageElement;
    try {
      picture = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      picture = await loadImg(file); // e.g. SVG
    }
    let width = picture.width || 512; // an SVG without a size
    let height = picture.height || 512;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const context = source.getContext('2d');
    if (!context) throw new UnsupportedImage();
    context.imageSmoothingQuality = 'high';
    context.drawImage(picture, 0, 0, width, height);
    // Release the full-size decoded picture now, not whenever memory is
    // cleaned up: from here on only the (at most 2048 px) canvas is used.
    if ('close' in picture) picture.close();
    return { source, width, height };
  } catch (decodeError) {
    throw decodeError instanceof UnsupportedImage || decodeError instanceof ImageTooLarge ? decodeError : new UnsupportedImage();
  }
}

/** The cropped square as a 192x192 image (WebP, PNG where WebP isn't
 *  available). Re-drawing drops the file's metadata (location, camera) and
 *  never keeps SVG code. */
export function cropToDataUrl(image: DecodedImage, box: Box): string {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_PX;
  canvas.height = ICON_PX;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image.source, box.x, box.y, box.size, box.size, 0, 0, ICON_PX, ICON_PX);
  const webp = canvas.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}
