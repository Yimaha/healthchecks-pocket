import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { platform } from '../../src/platform';
import { check } from '../fixtures/healthchecks';
import { account, answerConfirms, fakeServer, savedProjects, startApp, text } from '../helpers';

const home = account();
const work = account({ id: 'p2', name: 'Work', apiKey: 'key-work-1234', baseUrl: 'https://hc.example.org' });
const button = (name: string) => screen.getAllByRole('button', { name }).at(-1) as HTMLButtonElement;
const savedProjectIds = () => savedProjects().map((project) => project.id);
/** The next write of the saved project list fails, as a storage error would. */
function failNextProjectListWrite() {
  const saveToStorage = platform.save;
  let failuresLeft = 1;
  vi.spyOn(platform, 'save').mockImplementation(async (storageKey, storedValue) => {
    if (storageKey === 'healthchecks-pocket.projects' && failuresLeft-- > 0) throw new Error('Storage full');
    return saveToStorage(storageKey, storedValue);
  });
}

describe('a save that fails is shown, and nothing changes', () => {
  it('adding a project: the form stays as typed and says why; Add again works', async () => {
    fakeServer([{ key: 'key-real', checks: [check] }]);
    vi.spyOn(platform, 'saveSecret').mockRejectedValueOnce(new Error('Keystore unavailable'));
    const { user } = startApp({ accounts: [] });
    await user.type(await screen.findByPlaceholderText('Paste API key'), 'key-real');
    await user.click(button('Add project'));
    expect(text(await screen.findByRole('alert'))).toBe("Couldn't save on this device: Keystore unavailable");
    expect((screen.getByPlaceholderText('Paste API key') as HTMLInputElement).value).toBe('key-real');
    expect(savedProjects()).toEqual([]);

    await user.click(button('Add project'));
    await waitFor(() => expect(document.querySelectorAll('.check-row')).toHaveLength(1));
    expect(savedProjects()).toMatchObject([{ apiKey: 'key-real' }]);
  });

  it('removing a project that can\'t be saved keeps the project, with its key', async () => {
    fakeServer([]);
    answerConfirms(true);
    failNextProjectListWrite();
    const { user } = startApp({ accounts: [home, work], hash: '#/settings' });
    await user.click(await screen.findByRole('link', { name: 'Edit Work' }));
    await user.click(button('Remove project'));
    expect(text(await screen.findByRole('alert'))).toBe("Couldn't save on this device: Storage full");
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Edit project');
    expect(button('Remove project').disabled).toBe(false);
    expect(savedProjectIds()).toEqual(['p1', 'p2']);
    expect(localStorage.getItem('healthchecks-pocket.apiKey.p2')).toBe('key-work-1234');
  });

  it('Remove all projects no longer reports success when saving fails', async () => {
    fakeServer([]);
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ 'p1/a': 'preset:star' }));
    failNextProjectListWrite();
    const { user } = startApp({ accounts: [home, work], hash: '#/settings/risky' });
    await user.click(await screen.findByRole('button', { name: 'Remove all projects' }));
    await user.click(button('Remove all projects')); // the warning's confirm
    expect(text(await screen.findByRole('alert'))).toBe("Couldn't save on this device: Storage full");
    expect(window.location.hash).toBe('#/settings/risky');
    expect(savedProjectIds()).toEqual(['p1', 'p2']);
    expect(localStorage.getItem('healthchecks-pocket.icons.assigned')).toBe(JSON.stringify({ 'p1/a': 'preset:star' })); // icons kept with them
  });
});

describe('API key protection that can\'t be switched', () => {
  const secretProtection = platform.secretProtection;
  afterEach(() => {
    platform.secretProtection = secretProtection;
  });

  it('stays as it was and says why', async () => {
    platform.secretProtection = 'keystore';
    fakeServer([]);
    answerConfirms(true);
    const saveToStorage = platform.save;
    vi.spyOn(platform, 'save').mockImplementation(async (storageKey, storedValue) => {
      if (storageKey === 'healthchecks-pocket.carriedKeys') throw new Error('Storage full');
      return saveToStorage(storageKey, storedValue);
    });
    const { user } = startApp({ accounts: [home], hash: '#/settings' });
    const toggle = await screen.findByRole('checkbox', { name: /Keep API keys on this device only/ }) as HTMLInputElement;
    await user.click(toggle);
    expect(text(await screen.findByRole('alert'))).toBe("Couldn't move your API keys: Storage full");
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(false);
    expect(localStorage.getItem('healthchecks-pocket.keys.deviceOnly')).toBeNull();
    expect(localStorage.getItem('healthchecks-pocket.apiKey.p1')).toBe('key-home');
  });
});
