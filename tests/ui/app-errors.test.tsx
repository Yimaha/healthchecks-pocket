import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { platform } from '../../src/platform';
import { check } from '../fixtures/healthchecks';
import { answerConfirms, fakeServer, startApp, text } from '../helpers';

// The Settings screen stands in for any screen that throws while rendering.
vi.mock('../../src/ui/Settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ui/Settings')>()),
  Settings: () => { throw new Error('Settings broke'); },
}));

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const checkRows = () => document.querySelectorAll('.check-row');

/** Reading the saved project list fails `times` times, as when secure storage can't be read. */
function failLoadingProjects(times: number) {
  const loadFromStorage = platform.load;
  let failuresLeft = times;
  vi.spyOn(platform, 'load').mockImplementation(async (storageKey) => {
    if (storageKey === 'healthchecks-pocket.projects' && failuresLeft-- > 0) throw new Error('Storage unavailable');
    return loadFromStorage(storageKey);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startup that fails', () => {
  it('says what happened instead of staying on "Getting … ready"; Try again loads the projects', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    failLoadingProjects(1);
    const { user } = startApp();
    expect(text(await screen.findByRole('alert'))).toBe("Couldn't load your projects Storage unavailable");
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();

    await user.click(button('Try again'));
    await waitFor(() => expect(checkRows()).toHaveLength(1));
  });

  it('Reset the app asks first, then deletes everything and starts at the first-launch setup', async () => {
    fakeServer([]);
    failLoadingProjects(1);
    const asked = answerConfirms(false, true);
    const { user } = startApp();
    await screen.findByText("Couldn't load your projects");

    await user.click(button('Reset the app'));
    expect(asked).toEqual(['Reset the app? Every project, API key and setting on this device is deleted, and the app starts again as if just installed.']);
    expect(localStorage.getItem('healthchecks-pocket.projects')).not.toBeNull(); // cancelled: nothing deleted

    await user.click(button('Reset the app'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Healthchecks Pocket'));
    expect(Object.keys(localStorage).filter((storageKey) => storageKey.startsWith('healthchecks-pocket.'))).toEqual([]);
  });

  it('a reset that fails says so and keeps both ways out', async () => {
    fakeServer([]);
    failLoadingProjects(1);
    answerConfirms(true);
    vi.spyOn(platform, 'clearAll').mockRejectedValueOnce(new Error('Storage locked'));
    const { user } = startApp();
    await screen.findByText("Couldn't load your projects");
    await user.click(button('Reset the app'));
    expect(text(await screen.findByText('Storage locked'))).toBe('Storage locked');
    expect(button('Try again').disabled).toBe(false);
    expect(button('Reset the app').disabled).toBe(false);
  });

  it('a damaged project list ([null]) no longer hangs startup', async () => {
    fakeServer([]);
    localStorage.setItem('healthchecks-pocket.projects', '[null]');
    startApp({ accounts: [] });
    expect(await screen.findByText('Set up a project in Settings')).toBeTruthy();
  });
});

describe('a screen that crashes', () => {
  it('shows what happened instead of a blank page; Try again goes back to the check list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React reports the caught error
    fakeServer([{ key: 'key-home', checks: [check] }]);
    const { user } = startApp({ hash: '#/settings' });
    expect(text(await screen.findByRole('alert'))).toBe('Something went wrong Settings broke');

    await user.click(button('Try again'));
    await waitFor(() => expect(checkRows()).toHaveLength(1));
    expect(window.location.hash).toBe('#/');
  });
});
