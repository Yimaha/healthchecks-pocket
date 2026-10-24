import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@/core/app';
import { platform } from '@/platform';
import { check } from '../../fixtures/healthchecks';
import { answerConfirms, fakeServer, startApp, text } from '../../helpers';

// The Settings screen stands in for any screen that throws while rendering.
vi.mock('@/ui/pages/settings/Settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ui/pages/settings/Settings')>()),
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

  it('has a crash log to copy for a bug report: version, screen, what failed and the error, without saved data', async () => {
    fakeServer([]);
    failLoadingProjects(1);
    const copyText = vi.spyOn(platform, 'copyText').mockResolvedValue();
    const { user } = startApp();
    await screen.findByText("Couldn't load your projects");
    await user.click(screen.getByText('Crash log', { selector: 'summary' }));
    const crashLog = screen.getByLabelText('Crash log').textContent!;
    expect(crashLog).toContain(`Healthchecks Pocket ${APP_VERSION}`);
    expect(crashLog).toContain('Screen: list');
    expect(crashLog).toContain("What failed: Couldn't load your projects");
    expect(crashLog).toContain('Error: Error: Storage unavailable');
    expect(crashLog).not.toContain('key-home'); // the saved project's API key
    expect(crashLog).not.toContain('Home lab');

    await user.click(button('Copy crash log'));
    expect(copyText).toHaveBeenCalledWith(crashLog);
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('says a project list damaged as a whole is damaged; Reset the app starts again, without its API keys', async () => {
    fakeServer([]);
    answerConfirms(true);
    localStorage.setItem('healthchecks-pocket.projects', '{"truncated": [');
    localStorage.setItem('healthchecks-pocket.apiKey.p1', 'key-home');
    const { user } = startApp({ projects: [] });
    expect(text(await screen.findByRole('alert'))).toBe(
      "Couldn't load your projects The saved list of projects is damaged and can't be read. Reset the app to start again: it also deletes the API keys saved for them.",
    );
    await user.click(button('Reset the app'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Healthchecks Pocket'));
    expect(localStorage.getItem('healthchecks-pocket.apiKey.p1')).toBeNull();
  });

  it('a damaged project list ([null]) no longer hangs startup', async () => {
    fakeServer([]);
    localStorage.setItem('healthchecks-pocket.projects', '[null]');
    startApp({ projects: [] });
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

  it('its crash log names the screen and the parts React was drawing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React reports the caught error
    fakeServer([]);
    startApp({ hash: '#/settings' });
    await screen.findByRole('alert');
    const crashLog = () => screen.getByLabelText('Crash log').textContent!;
    await waitFor(() => expect(crashLog()).toContain('Screen parts (React):'));
    expect(crashLog()).toContain('Screen: settings');
    expect(crashLog()).toContain('What failed: Something went wrong');
    expect(crashLog()).toContain('Error: Error: Settings broke');
    expect(crashLog()).toMatch(/Screen parts \(React\):\n.*Settings/);
  });
});
