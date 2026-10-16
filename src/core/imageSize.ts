// An image's size in pixels, read from the first bytes of its file, without decoding it. Decoding a huge image
// (a 200-megapixel photo, or a tiny PNG that claims 30000 x 30000) can crash the WebView, and with it the app.

export interface ImageDimensions {
  width: number;
  height: number;
}

/** The bytes to read from the start of a file: enough to get past a JPEG's EXIF data and thumbnail to its size. */
export const IMAGE_HEADER_BYTES = 1 << 20;

/** The width and height a PNG, JPEG, GIF, BMP, WebP or AVIF file says it has; undefined for other files (SVG, ICO)
 *  or a header that's cut off. */
export function readImageDimensions(headerBytes: Uint8Array): ImageDimensions | undefined {
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  try {
    if (startsWith(headerBytes, [0x89, 0x50, 0x4e, 0x47])) return { width: view.getUint32(16), height: view.getUint32(20) };
    if (startsWith(headerBytes, [0xff, 0xd8])) return jpegDimensions(headerBytes, view);
    if (asciiAt(headerBytes, 0, 3) === 'GIF') return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (asciiAt(headerBytes, 0, 2) === 'BM') return bmpDimensions(view);
    if (asciiAt(headerBytes, 0, 4) === 'RIFF' && asciiAt(headerBytes, 8, 4) === 'WEBP') return webpDimensions(headerBytes, view);
    if (asciiAt(headerBytes, 4, 4) === 'ftyp') return largestIspeDimensions(headerBytes, view);
  } catch {
    // A header shorter than it says (DataView reads past the end): the size is unknown.
  }
  return undefined;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((prefixByte, index) => bytes[index] === prefixByte);
}

function asciiAt(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Walks the segments to the first start-of-frame (SOFn), which holds the size. */
function jpegDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset++; continue; } // fill byte before a marker
    // Markers without a length: restarts, start of image, and TEM.
    if ((marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) { offset += 2; continue; }
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return undefined;
}

function bmpDimensions(view: DataView): ImageDimensions {
  // A 12-byte OS/2 header has 16-bit sizes; the others 32-bit, with a negative height for top-down rows.
  if (view.getUint32(14, true) === 12) return { width: view.getUint16(18, true), height: view.getUint16(20, true) };
  return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
}

function webpDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  const firstChunkType = asciiAt(bytes, 12, 4);
  if (firstChunkType === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (firstChunkType === 'VP8L') {
    const packedSizes = view.getUint32(21, true); // 14 bits each: width - 1, then height - 1
    return { width: (packedSizes & 0x3fff) + 1, height: ((packedSizes >>> 14) & 0x3fff) + 1 };
  }
  if (firstChunkType === 'VP8X') return { width: uint24At(bytes, 24) + 1, height: uint24At(bytes, 27) + 1 };
  return undefined;
}

function uint24At(bytes: Uint8Array, offset: number): number {
  if (offset + 3 > bytes.length) throw new RangeError('cut off');
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/** AVIF (HEIF) keeps each image's size in an `ispe` box. A gridded image has one per tile and one for the whole,
 *  so the largest is the picture's size. */
function largestIspeDimensions(bytes: Uint8Array, view: DataView): ImageDimensions | undefined {
  let largest: ImageDimensions | undefined;
  for (let offset = 0; offset + 16 <= bytes.length; offset++) {
    if (bytes[offset] !== 0x69 || asciiAt(bytes, offset, 4) !== 'ispe') continue;
    // After the type: 4 bytes of version and flags, then width and height.
    const ispeDimensions = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) };
    if (!largest || ispeDimensions.width * ispeDimensions.height > largest.width * largest.height) largest = ispeDimensions;
  }
  return largest;
}
