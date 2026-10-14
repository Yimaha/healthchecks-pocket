// Check icons with real images in a real browser: every accepted format
// decodes, the crop box drags and resizes, and the saved icon is the chosen
// square at 192x192.

import type { Page } from '@playwright/test';
import { defaultProject, expect, fakeApi, openApp, test, UUID } from './fixtures';

/** A w x h picture, left half red and right half blue, encoded by the browser. */
async function picture(page: Page, type: string, width = 400, height = 200): Promise<Buffer> {
  const dataUrl = await page.evaluate(([type, width, height]) => {
    const canvas = document.createElement('canvas');
    canvas.width = Number(width);
    canvas.height = Number(height);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, Number(width) / 2, Number(height));
    context.fillStyle = '#0000ff';
    context.fillRect(Number(width) / 2, 0, Number(width) / 2, Number(height));
    return canvas.toDataURL(String(type));
  }, [type, width, height]);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** 24-bit BMP, all one colour. */
function bmp(width: number, height: number, [red, green, blue]: number[]): Buffer {
  const row = Math.ceil((width * 3) / 4) * 4;
  const buffer = Buffer.alloc(54 + row * height);
  buffer.write('BM');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) buffer.set([blue, green, red], 54 + y * row + x * 3);
  return buffer;
}

/** An .ico holding one PNG (how modern icons are stored). */
function ico(png: Buffer, size: number): Buffer {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(1, 4); // one image
  head[6] = size;
  head[7] = size;
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

const GIF = Buffer.from('R0lGODlhAQABAIAAAP8AAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'); // 1x1 red
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><script>alert(1)</script><rect width="150" height="200" fill="red"/><rect x="150" width="150" height="200" fill="blue"/></svg>');

async function openPicker(page: Page) {
  await fakeApi(page, [defaultProject()]);
  await openApp(page, { hash: `#/check/${UUID}`, storage: { 'healthchecks-pocket.lights': 'off' } });
  await page.getByRole('link', { name: 'Change icon' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Icon');
}

/** The saved icon on the check page: its size and its centre pixel's colour. */
async function savedIcon(page: Page) {
  const iconImage = page.getByRole('link', { name: 'Change icon' }).locator('img');
  await expect(iconImage).toHaveAttribute('src', /^data:image\/(webp|png);base64,/);
  return iconImage.evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const [red, green, blue] = context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    return { width: image.naturalWidth, height: image.naturalHeight, rgb: [red, green, blue] };
  });
}

test('PNG, JPEG, WebP, GIF, BMP, SVG and ICO images all become 192x192 icons', async ({ page }) => {
  await openPicker(page);
  const files = [
    { name: 'a.png', mimeType: 'image/png', buffer: await picture(page, 'image/png') },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: await picture(page, 'image/jpeg') },
    { name: 'c.webp', mimeType: 'image/webp', buffer: await picture(page, 'image/webp') },
    { name: 'd.gif', mimeType: 'image/gif', buffer: GIF },
    { name: 'e.bmp', mimeType: 'image/bmp', buffer: bmp(64, 32, [255, 0, 0]) },
    { name: 'f.svg', mimeType: 'image/svg+xml', buffer: SVG },
    { name: 'g.ico', mimeType: 'image/x-icon', buffer: ico(await picture(page, 'image/png', 48, 48), 48) },
  ];
  page.on('dialog', () => { throw new Error('a script in the SVG ran'); });
  for (const file of files) {
    await page.getByLabel('Upload an image').setInputFiles(file);
    await expect(page.getByRole('slider', { name: 'Crop area' }), file.name).toBeVisible();
    await page.getByRole('button', { name: 'Use this icon' }).click();
    const icon = await savedIcon(page);
    expect(icon.width, file.name).toBe(192);
    expect(icon.height, file.name).toBe(192);
    await page.getByRole('link', { name: 'Change icon' }).click();
  }
  await expect(page.locator('.icon-delete')).toHaveCount(files.length); // all in "Your icons"
});

test('drag the crop box to choose the square; drag its corner to resize it', async ({ page }) => {
  await openPicker(page);
  await page.getByLabel('Upload an image').setInputFiles({ name: 'flag.png', mimeType: 'image/png', buffer: await picture(page, 'image/png', 400, 200) });
  const box = page.getByRole('slider', { name: 'Crop area' });
  await expect(box).toHaveAttribute('aria-valuetext', '200 pixels square'); // centred: half red, half blue

  // Drag it all the way left: the red half.
  const bounds = (await box.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 300, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  // Shrink it from the corner.
  const handleBounds = (await page.getByLabel('Resize').boundingBox())!;
  await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + handleBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBounds.x - 60, handleBounds.y - 60, { steps: 6 });
  await page.mouse.up();
  const size = Number((await box.getAttribute('aria-valuetext'))!.split(' ')[0]);
  expect(size).toBeLessThan(200);
  expect(size).toBeGreaterThan(40);

  await page.getByRole('button', { name: 'Use this icon' }).click();
  const icon = await savedIcon(page);
  expect(icon.rgb[0]).toBeGreaterThan(200); // red
  expect(icon.rgb[2]).toBeLessThan(60); // not blue
});

test('on a touch screen: drag the box with a finger, pinch to resize', async ({ page, context }) => {
  await openPicker(page);
  await page.getByLabel('Upload an image').setInputFiles({ name: 'flag.png', mimeType: 'image/png', buffer: await picture(page, 'image/png', 400, 200) });
  const box = page.getByRole('slider', { name: 'Crop area' });
  const bounds = (await box.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, i) => ({ ...point, id: i + 1 })) });
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;

  // Pinch in: two fingers move together, the square shrinks around its centre.
  await touch('touchStart', [{ x: centreX - 60, y: centreY }, { x: centreX + 60, y: centreY }]);
  for (const gap of [50, 40, 30]) await touch('touchMove', [{ x: centreX - gap, y: centreY }, { x: centreX + gap, y: centreY }]);
  await touch('touchEnd', []);
  const size = Number((await box.getAttribute('aria-valuetext'))!.split(' ')[0]);
  expect(size).toBeLessThan(150);

  // One finger: drag it to the right (blue) half.
  const pinchedBounds = (await box.boundingBox())!;
  const x = pinchedBounds.x + pinchedBounds.width / 2;
  const y = pinchedBounds.y + pinchedBounds.height / 2;
  await touch('touchStart', [{ x, y }]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: x + i * 40, y }]);
  await touch('touchEnd', []);
  await page.getByRole('button', { name: 'Use this icon' }).click();
  const icon = await savedIcon(page);
  expect(icon.rgb[2]).toBeGreaterThan(200); // blue
  expect(icon.rgb[0]).toBeLessThan(60);
});

test('HEIC is refused with a message', async ({ page }) => {
  await openPicker(page);
  await page.getByLabel('Upload an image').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not really') });
  await expect(page.getByRole('alert')).toHaveText("This image type isn't supported here. Try a JPEG or PNG.");
});

test('the icon picker and cropper fit a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openPicker(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByLabel('Upload an image').setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: await picture(page, 'image/png', 200, 600) });
  await expect(page.getByRole('slider', { name: 'Crop area' })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('the "in use" dot shows on an uploaded icon too, not hidden under its delete button', async ({ page }) => {
  const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await fakeApi(page, [defaultProject()]);
  await openApp(page, {
    storage: {
      'healthchecks-pocket.icons.uploads': JSON.stringify(['c1']),
      'healthchecks-pocket.icons.upload.c1': `data:image/png;base64,${onePixelPng}`,
      'healthchecks-pocket.icons.assigned': JSON.stringify({ 'p1/uuid-web': 'custom:c1' }), // another check uses the upload
    },
  });
  await expect(page.locator('.check-row')).toHaveCount(2); // list loaded, so the web check counts as live
  await page.evaluate((hash) => { location.hash = hash; }, `#/check/${UUID}/icon`);

  const uploadedChoice = page.locator('.icon-choice').filter({ has: page.getByRole('button', { name: 'Your icon (in use)' }) });
  const inUseDot = uploadedChoice.locator('.icon-in-use');
  await expect(inUseDot).toBeVisible();
  // Nothing (like the delete button) may sit on top of the dot.
  const dotIsOnTop = await inUseDot.evaluate((dot) => {
    const box = dot.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === dot;
  });
  expect(dotIsOnTop).toBe(true);
});
