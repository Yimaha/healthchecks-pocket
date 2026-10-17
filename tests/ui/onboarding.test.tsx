import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { platform } from '../../src/platform';
import { account, answerConfirms, fakeServer, startApp, text } from '../helpers';

const fresh = () => startApp({ accounts: [], onboarded: false });
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const sections = () => [...document.querySelectorAll('.section-title')].map((heading) => heading.textContent);
const picker = () => screen.getByRole('combobox', { name: /^Theme/ }) as HTMLSelectElement;

describe('onboarding (first launch)', () => {
  const protection = platform.secretProtection;
  const updates = platform.updatesSupported;
  afterEach(() => {
    platform.secretProtection = protection;
    platform.updatesSupported = updates;
  });

  it('shows the settings with their defaults before adding a project', async () => {
    platform.secretProtection = 'keystore';
    platform.updatesSupported = true;
    localStorage.setItem('healthchecks-pocket.updates.lastCheck', String(Date.now()));
    fakeServer([]);
    fresh();
    await waitFor(() => expect(heading()).toBe('Welcome to Healthchecks Pocket'));
    expect(text(document.querySelector('.hero'))).toBe(
      'Hello 👋 Welcome to Healthchecks Pocket All your checks, a glance away. First, make it yours: ' +
        'everything below is already set to a good default, and you can change it any time in Settings.',
    );
    expect(document.querySelector('.aurora')?.getAttribute('aria-hidden')).toBe('true');
    expect(sections()).toEqual(['Appearance', 'Time zone', 'Ping logs', 'API keys', 'Updates']);
    expect(picker().value).toBe('dark');
    expect(picker().selectedOptions[0].textContent).toBe('Dark (default)');
    const background = screen.getByRole('combobox', { name: /^Background/ }) as HTMLSelectElement;
    expect(background.selectedOptions[0].textContent).toBe('Northern lights, breathing (default)');
    expect([...background.options].map((option) => option.value)).toEqual(['always', 'loading', 'breathing', 'heartbeat', 'off']);
    const tz = screen.getByRole('combobox', { name: /Times in the app are shown in/ }) as HTMLSelectElement;
    expect(tz.selectedOptions[0].textContent).toBe('Asia/Tokyo (UTC+9), default');
    expect(screen.getByLabelText('Text size').textContent).toBe('13');
    expect(screen.getByRole('button', { name: 'Wrap' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('checkbox', { name: /Keep API keys on this device only/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Check for updates once a day' }) as HTMLInputElement).checked).toBe(true);
  });

  it('applies each change at once: theme, text size, wrapping', async () => {
    fakeServer([]);
    const { user } = fresh();
    await screen.findByText(/First, make it yours/);
    await user.selectOptions(picker(), 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.selectOptions(picker(), 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Larger text' }));
    expect((screen.getByLabelText('Sample log') as HTMLElement).style.fontSize).toBe('14px');
    await user.click(screen.getByRole('button', { name: 'Wrap' }));
    expect(screen.getByLabelText('Sample log').className).toBe('body body-nowrap');
    expect(localStorage.getItem('healthchecks-pocket.theme')).toBe('light');
    expect(localStorage.getItem('healthchecks-pocket.pingBody.size')).toBe('14');
    expect(localStorage.getItem('healthchecks-pocket.pingBody.wrap')).toBe('0');
  });

  it('turning key protection off asks first, then saves the choice', async () => {
    platform.secretProtection = 'keystore';
    answerConfirms(true);
    fakeServer([]);
    const { user } = fresh();
    await user.click(await screen.findByRole('checkbox', { name: /Keep API keys on this device only/ }));
    expect(localStorage.getItem('healthchecks-pocket.keys.deviceOnly')).toBe('0');
  });

  it('the first project\'s key is kept the way chosen during onboarding', async () => {
    platform.secretProtection = 'keystore';
    answerConfirms(true);
    fakeServer([]);
    const { user } = fresh();
    await user.click(await screen.findByRole('checkbox', { name: /Keep API keys on this device only/ }));
    await user.click(screen.getByRole('button', { name: "Let's go" }));
    await user.click(await screen.findByRole('button', { name: 'No key yet? Try the demo' }));
    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.carriedKeys')).toContain('demo'));
    expect(Object.keys(localStorage).filter((storageKey) => storageKey.includes('apiKey'))).toEqual([]);
  });

  it('Let\'s go leads to adding a project, and onboarding doesn\'t come back', async () => {
    fakeServer([]);
    const { user, unmount } = fresh();
    await user.click(await screen.findByRole('button', { name: "Let's go" }));
    expect(await screen.findByText(/Paste a project API key/)).toBeTruthy();
    expect(localStorage.getItem('healthchecks-pocket.onboarded')).toBe('1');
    unmount();
    startApp({ accounts: [], onboarded: false });
    expect(await screen.findByText(/Paste a project API key/)).toBeTruthy();
  });

  it('is skipped by installs that already have projects (updating from an older version)', async () => {
    fakeServer([{ key: 'key-home', checks: [] }]);
    startApp({ accounts: [account()], onboarded: false });
    await screen.findByText('Home lab');
    expect(screen.queryByText(/First, make it yours/)).toBeNull();
    expect(localStorage.getItem('healthchecks-pocket.onboarded')).toBe('1');
  });

  it('the browser version has nothing to encrypt with or update, so no such sections', async () => {
    fakeServer([]);
    fresh();
    await screen.findByText(/First, make it yours/);
    expect(sections()).toEqual(['Appearance', 'Time zone', 'Ping logs']);
    expect(text(screen.getByLabelText('Sample log'))).toContain('[ERROR] upload failed');
  });
});
