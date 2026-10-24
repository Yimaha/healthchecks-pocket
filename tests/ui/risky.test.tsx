import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { check } from '../fixtures/healthchecks';
import { fakeServer, makeProject, savedProjectsWithKeys, startApp, text } from '../helpers';

const home = makeProject();
const work = makeProject({ id: 'p2', name: 'Work', apiKey: 'key-work-1234' });
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('risky actions', () => {
  it('has its own page, linked at the bottom of Settings', async () => {
    fakeServer([]);
    const { user } = startApp({ hash: '#/settings' });
    await user.click(await screen.findByRole('link', { name: 'Risky actions' }));
    expect(window.location.hash).toBe('#/settings/risky');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Risky actions');
    expect([...document.querySelectorAll('.card-title')].map((heading) => heading.textContent)).toEqual(['Remove all projects', 'Reset the app', 'Debug: simulate a crash']);
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('#/settings');
  });

  const warning = (title: string) => screen.queryByRole('alertdialog', { name: title });

  it('Remove all projects first says what will happen; then removes projects with their keys, keeps settings', async () => {
    fakeServer([]);
    localStorage.setItem('healthchecks-pocket.theme', 'dark');
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ 'p1/a': 'preset:star', 'p2/b': 'preset:moon' }));
    const { user } = startApp({ projects: [home, work], hash: '#/settings/risky' });
    await user.click(await screen.findByRole('button', { name: 'Remove all projects' }));
    expect([...warning('Remove all projects?')!.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'All 2 projects are removed from this device, with their API keys.',
      'Your settings stay: appearance, time zone, ping log view, API key protection and update checks.',
      'The check list is empty until you add a project again in Settings.',
    ]);

    await user.click(button('Cancel'));
    expect(warning('Remove all projects?')).toBeNull();
    expect(savedProjectsWithKeys()).toHaveLength(2);

    await user.click(button('Remove all projects'));
    await user.click(screen.getAllByRole('button', { name: 'Remove all projects' }).at(-1)!); // the warning's confirm
    expect(await screen.findByText('Set up a project in Settings')).toBeTruthy();
    expect(window.location.hash).toBe('#/');
    expect(savedProjectsWithKeys()).toEqual([]);
    expect(Object.keys(localStorage).filter((key) => key.includes('apiKey'))).toEqual([]);
    expect(localStorage.getItem('healthchecks-pocket.theme')).toBe('dark');
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.icons.assigned')).toBe('{}')); // their icons go too
  });

  it('Reset the app first warns that you go through first-launch setup again; nothing is deleted until confirmed', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    localStorage.setItem('healthchecks-pocket.theme', 'dark');
    localStorage.setItem('unrelated', 'kept'); // another app's data on the same origin (web version)
    const { user } = startApp({ hash: '#/settings/risky' });
    await user.click(await screen.findByRole('button', { name: 'Reset the app' }));
    expect(text(warning('Reset the app?')!.querySelector('.warning-title'))).toBe('Reset the app? This happens:');
    expect([...warning('Reset the app?')!.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'Every project and API key on this device is deleted.',
      'All settings go back to their defaults: appearance, time zone, ping log view, API key protection and update checks.',
      'The app restarts at the first-launch setup. You go through it again, then add your projects and paste their API keys.',
    ]);

    await user.click(button('Cancel'));
    expect(warning('Reset the app?')).toBeNull();
    expect(savedProjectsWithKeys()).toHaveLength(1);
    expect(localStorage.getItem('healthchecks-pocket.theme')).toBe('dark');

    await user.click(button('Reset the app'));
    await user.click(button('Reset and start over'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Healthchecks Pocket'));
    expect(window.location.hash).toBe('#/');
    expect(Object.keys(localStorage).filter((key) => key.startsWith('healthchecks-pocket.'))).toEqual([]);
    expect(localStorage.getItem('unrelated')).toBe('kept');
    expect((screen.getByRole('combobox', { name: /^Theme/ }) as HTMLSelectElement).value).toBe('dark'); // the default
  });
});

describe('debug: simulate a crash', () => {
  const checkRows = () => document.querySelectorAll('.check-row');

  it('Crash this screen shows the error screen; Try again goes back to the check list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React reports the caught error
    fakeServer([{ key: 'key-home', checks: [check] }]);
    const { user } = startApp({ hash: '#/settings/risky' });
    await user.click(await screen.findByRole('button', { name: 'Crash this screen' }));
    expect(text(await screen.findByRole('alert'))).toBe('Something went wrong Simulated crash: this screen threw while drawing (Risky actions > Debug).');

    await user.click(button('Try again'));
    await waitFor(() => expect(checkRows()).toHaveLength(1));
    expect(window.location.hash).toBe('#/');
  });

  it('Restart and fail to load projects restarts into the startup error screen, once; Try again loads them', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    const { user } = startApp({ hash: '#/settings/risky' });
    await user.click(await screen.findByRole('button', { name: 'Restart and fail to load projects' }));
    expect(text(await screen.findByRole('alert'))).toBe("Couldn't load your projects Simulated failure: the saved projects couldn't be loaded (Risky actions > Debug).");
    expect(window.location.hash).toBe('#/');
    expect(localStorage.getItem('healthchecks-pocket.debug.failNextProjectLoad')).toBeNull(); // fails once only
    expect(savedProjectsWithKeys()).toEqual([home]); // nothing saved changed

    await user.click(button('Try again'));
    await waitFor(() => expect(checkRows()).toHaveLength(1));
  });
});
