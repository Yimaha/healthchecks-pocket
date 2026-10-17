import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Box } from '../../src/core/crop';
import type { Check } from '../../src/core/types';
import { platform } from '../../src/platform';
import { useIcons } from '../../src/ui/checkIcons';
import { check as base, UUID } from '../fixtures/healthchecks';
import { account, answerConfirms, fakeServer, startApp, text } from '../helpers';

// Canvas decoding and encoding happen in the browser (tested in e2e); here they're stubbed.
const cropped: Box[] = [];
vi.mock('../../src/ui/imageTools', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/ui/imageTools')>();
  return {
    ...real,
    decodeImage: vi.fn(async (file: File) => {
      if (/hei[cf]/i.test(file.name)) throw new real.UnsupportedImage();
      return { source: document.createElement('canvas'), width: 400, height: 300 };
    }),
    cropToDataUrl: vi.fn((_img: unknown, box: Box) => {
      cropped.push(box);
      return 'data:image/png;base64,ICON';
    }),
  };
});

const makeCheck = (name: string, uuid: string, tags = ''): Check => ({ ...base, name, slug: name, uuid, tags });
const checks = [makeCheck('nightly backup', UUID, 'nas'), makeCheck('website', 'uuid-web'), makeCheck('mystery', 'uuid-x')];
const savedIconsByCheck = () => JSON.parse(localStorage.getItem('healthchecks-pocket.icons.assigned') ?? '{}');
const uploadIds = () => JSON.parse(localStorage.getItem('healthchecks-pocket.icons.uploads') ?? '[]');
const tileColor = (element: Element | null) => (element?.querySelector('.check-icon-tile') as HTMLElement | null)?.style.background;

beforeEach(() => {
  cropped.length = 0;
});

describe('check icons', () => {
  it('every check gets a default icon, suggested by its name and not repeated, saved so it stays', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { unmount } = startApp();
    await waitFor(() => expect(Object.keys(savedIconsByCheck())).toHaveLength(3));
    expect(savedIconsByCheck()).toEqual({ [`p1/${UUID}`]: 'preset:archive', 'p1/uuid-web': 'preset:globe', 'p1/uuid-x': 'preset:server' });
    const rows = [...document.querySelectorAll('.check-row')];
    expect(rows.map((row) => !!row.querySelector('.check-icon-sm .check-icon-glyph'))).toEqual([true, true, true]);
    expect(rows.every((row) => row.querySelector('.check-icon-status .dot'))).toBe(true); // the status dot as a badge
    unmount();

    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ ...savedIconsByCheck(), 'p1/uuid-web': 'preset:star' }));
    startApp();
    await waitFor(() => expect(document.querySelectorAll('.check-row')).toHaveLength(3));
    expect(savedIconsByCheck()['p1/uuid-web']).toBe('preset:star'); // kept, never reassigned
  });

  it('keeps icons of checks deleted on healthchecks.io, without counting them as used', async () => {
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ 'p1/gone': 'preset:archive', 'p9/other': 'preset:sun' }));
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(Object.keys(savedIconsByCheck())).toHaveLength(5));
    expect(savedIconsByCheck()['p1/gone']).toBe('preset:archive'); // never deleted behind the user's back
    expect(savedIconsByCheck()[`p1/${UUID}`]).toBe('preset:archive'); // free again: the backup check gets it
    expect(savedIconsByCheck()['p9/other']).toBe('preset:sun'); // another project's
  });

  it('without the icons provider, a check shows its default and no icon counts as in use', () => {
    const { result } = renderHook(() => useIcons());
    expect(result.current.iconForCheck('p1', checks[0])).toBe('preset:archive');
    expect(result.current.iconsUsedByOtherChecks('p1', `p1/${UUID}`).size).toBe(0);
  });

  it('the check page and the picker show a default without saving it; only the list saves icons', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp({ hash: `#/check/${UUID}` });
    const link = await screen.findByRole('link', { name: 'Change icon' });
    await waitFor(() => expect(link.querySelector('.check-icon-glyph')).not.toBeNull());
    await user.click(link);
    await screen.findByRole('button', { name: 'Backup', pressed: true });
    expect(localStorage.getItem('healthchecks-pocket.icons.assigned')).toBeNull();

    window.location.hash = '#/';
    await waitFor(() => expect(Object.keys(savedIconsByCheck())).toHaveLength(3));
  });

  it('the picker marks icons of live checks as in use, but not those of deleted checks', async () => {
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ 'p1/gone': 'preset:star' }));
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(Object.keys(savedIconsByCheck())).toHaveLength(4)); // the list loaded: live checks known
    window.location.hash = `#/check/${UUID}/icon`;
    await screen.findByRole('button', { name: 'Website (in use)' });
    expect(screen.getByRole('button', { name: 'Star' })).toBeTruthy(); // the deleted check's icon is free
  });

  it('switching projects from the list keeps the icons chosen for the other project', async () => {
    const work = account({ id: 'p2', name: 'Work', apiKey: 'key-work' });
    fakeServer([
      { key: 'key-home', checks },
      { key: 'key-work', checks: [makeCheck('payroll', 'uuid-payroll'), makeCheck('ci', 'uuid-ci')] },
    ]);
    const chosen = { 'p2/uuid-payroll': 'preset:star', 'p2/uuid-ci': 'custom:abc123' };
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify(chosen));
    localStorage.setItem('healthchecks-pocket.icons.uploads', JSON.stringify(['abc123']));
    localStorage.setItem('healthchecks-pocket.icons.upload.abc123', 'data:image/png;base64,ICON');
    const { user } = startApp({ accounts: [account(), work], active: 'p1' });
    await waitFor(() => expect(document.querySelectorAll('.check-row')).toHaveLength(3));
    await user.selectOptions(document.querySelector('.project-picker')!, 'p2');
    await waitFor(() => expect(document.querySelectorAll('.check-row')).toHaveLength(2));
    await waitFor(() => expect(Object.keys(savedIconsByCheck()).filter((key) => key.startsWith('p1/'))).toHaveLength(3));
    expect(Object.fromEntries(Object.entries(savedIconsByCheck()).filter(([key]) => key.startsWith('p2/')))).toEqual(chosen);
  });

  it('the check page shows the icon top left; tapping it opens the picker', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    startApp({ hash: `#/check/${UUID}` });
    const link = await screen.findByRole('link', { name: 'Change icon' });
    expect(link.getAttribute('href')).toBe(`#/check/${UUID}/icon`);
    await waitFor(() => expect(link.querySelector('.check-icon-lg .check-icon-glyph')).not.toBeNull());
    expect(link.closest('.card-row')?.firstElementChild).toBe(link); // first in the status card
  });

  it('picks a preset (even one another check uses) and goes back', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp({ hash: `#/check/${UUID}` });
    await user.click(await screen.findByRole('link', { name: 'Change icon' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Icon');
    await screen.findByRole('button', { name: 'Backup' });
    expect(screen.getAllByRole('button', { pressed: true }).map((button) => button.getAttribute('aria-label'))).toEqual(['Backup']);
    expect(document.querySelectorAll('.icon-grid')[1].querySelectorAll('.icon-choice-button')).toHaveLength(58);

    // The website check has the globe already: marked, but allowed.
    window.location.hash = '#/';
    await waitFor(() => expect(Object.keys(savedIconsByCheck())).toHaveLength(3));
    window.location.hash = `#/check/${UUID}/icon`;
    const globe = await screen.findByRole('button', { name: 'Website (in use)' });
    await user.click(globe);
    await waitFor(() => expect(savedIconsByCheck()[`p1/${UUID}`]).toBe('preset:globe'));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('uploads an image, crops it to a square, and uses it', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp({ hash: `#/check/${UUID}/icon` });
    const input = await screen.findByLabelText('Upload an image');
    expect(input.getAttribute('accept')).toBe('image/*,.heic,.heif,.ico,.svg,.bmp,.avif,.webp');
    await user.upload(input as HTMLInputElement, new File(['x'], 'cat.png', { type: 'image/png' }));
    const box = await screen.findByRole('slider', { name: 'Crop area' });
    expect(screen.getByRole('img', { name: 'Uploaded image' }).tagName).toBe('CANVAS');
    expect(box.getAttribute('aria-valuetext')).toBe('300 pixels square'); // the largest centred square
    await user.click(screen.getByRole('button', { name: 'Use this icon' }));
    expect(cropped).toEqual([{ x: 50, y: 0, size: 300 }]);
    await waitFor(() => expect(savedIconsByCheck()[`p1/${UUID}`]).toMatch(/^custom:/));
    // Stored as one key per image, plus the list of ids.
    const uploadId = savedIconsByCheck()[`p1/${UUID}`].slice('custom:'.length);
    expect(uploadId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); // crypto.randomUUID()
    await waitFor(() => expect(uploadIds()).toEqual([uploadId]));
    expect(localStorage.getItem(`healthchecks-pocket.icons.upload.${uploadId}`)).toBe('data:image/png;base64,ICON');
    expect(localStorage.getItem('healthchecks-pocket.icons.custom')).toBeNull();
  });

  it('moves the crop square with the arrow keys and resizes it with + and -', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp({ hash: `#/check/${UUID}/icon` });
    await user.upload(await screen.findByLabelText('Upload an image') as HTMLInputElement, new File(['x'], 'a.png', { type: 'image/png' }));
    const box = await screen.findByRole('slider', { name: 'Crop area' });
    expect([box.getAttribute('aria-valuemin'), box.getAttribute('aria-valuemax'), box.getAttribute('aria-valuenow')]).toEqual(['24', '300', '300']);
    box.focus();
    await user.keyboard('-');
    expect(box.getAttribute('aria-valuenow')).toBe('286'); // 300 / 1.05
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    await user.keyboard('+');
    await user.click(screen.getByRole('button', { name: 'Use this icon' }));
    const [saved] = cropped;
    expect(saved.size).toBeCloseTo(300);
    expect(saved.x).toBeLessThan(50); // moved left from the centre
  });

  it('Cancel on the cropper keeps the current icon', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp({ hash: `#/check/${UUID}/icon` });
    await user.upload(await screen.findByLabelText('Upload an image') as HTMLInputElement, new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(cropped).toEqual([]);
  });

  it('says when an image type isn\'t supported (HEIC)', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp({ hash: `#/check/${UUID}/icon` });
    await user.upload(await screen.findByLabelText('Upload an image') as HTMLInputElement, new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' }));
    expect(text(await screen.findByRole('alert'))).toBe("This image type isn't supported here. Try a JPEG or PNG.");
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('deleting an uploaded icon asks first; checks using it get their default back', async () => {
    localStorage.setItem('healthchecks-pocket.icons.uploads', JSON.stringify(['c1']));
    localStorage.setItem('healthchecks-pocket.icons.upload.c1', 'data:image/png;base64,MINE');
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ [`p1/${UUID}`]: 'custom:c1' }));
    fakeServer([{ key: 'key-home', checks }]);
    const asked = answerConfirms(false, true);
    const { user } = startApp({ hash: `#/check/${UUID}/icon` });
    await waitFor(() => expect(document.querySelector('.icon-current img')?.getAttribute('src')).toBe('data:image/png;base64,MINE'));
    await user.click(screen.getByRole('button', { name: 'Delete this icon' }));
    expect(asked[0]).toBe('Delete this icon? Checks using it go back to their default icon.');
    expect(uploadIds()).toEqual(['c1']);

    fireEvent.click(screen.getByRole('button', { name: 'Delete this icon' }));
    await waitFor(() => expect(savedIconsByCheck()[`p1/${UUID}`]).toBeUndefined());
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.icons.upload.c1')).toBeNull());
    expect(uploadIds()).toEqual([]);
    // Shown with its default right away; saved when the list next loads.
    expect(tileColor(document.querySelector('.icon-current'))).toBeTruthy();
    expect(screen.getAllByRole('button', { pressed: true }).map((button) => button.getAttribute('aria-label'))).toEqual(['Backup']);
    window.location.hash = '#/';
    await waitFor(() => expect(savedIconsByCheck()[`p1/${UUID}`]).toBe('preset:archive'));
  });

  it('moves uploads saved by 0.5.0 test builds (all in one value) to one key each', async () => {
    localStorage.setItem('healthchecks-pocket.icons.custom', JSON.stringify({ old1: 'data:image/webp;base64,ONE', old2: 'data:image/webp;base64,TWO' }));
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ [`p1/${UUID}`]: 'custom:old2' }));
    fakeServer([{ key: 'key-home', checks }]);
    startApp({ hash: `#/check/${UUID}` });
    await waitFor(() => expect(uploadIds()).toEqual(['old1', 'old2']));
    expect(localStorage.getItem('healthchecks-pocket.icons.upload.old2')).toBe('data:image/webp;base64,TWO');
    expect(localStorage.getItem('healthchecks-pocket.icons.custom')).toBeNull();
    await waitFor(() => expect(document.querySelector('.check-icon-edit img')?.getAttribute('src')).toBe('data:image/webp;base64,TWO'));
  });

  it('a failed save loses nothing: the next change saves everything', async () => {
    const save = vi.spyOn(platform, 'save');
    save.mockImplementation(async (key, value) => {
      if (key === 'healthchecks-pocket.icons.assigned' && save.mock.calls.filter(([savedKey]) => savedKey === key).length === 1) throw new Error('disk full');
      localStorage.setItem(key, value);
    });
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp({ hash: `#/check/${UUID}/icon` });
    await user.click(await screen.findByRole('button', { name: 'Star' }));
    await waitFor(() => expect(savedIconsByCheck()[`p1/${UUID}`]).toBe('preset:star'));
  });
});
