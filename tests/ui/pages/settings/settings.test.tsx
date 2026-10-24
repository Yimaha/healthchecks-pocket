import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@/core/app';
import { platform } from '@/platform';
import { check, NOW, readOnlyCheck } from '../../../fixtures/healthchecks';
import { answerConfirms, fakeServer, makeProject, savedProjectsWithKeys, startApp, text } from '../../../helpers';

const home = makeProject();
const work = makeProject({ id: 'p2', name: 'Work', apiKey: 'key-work-1234', pingLogDays: 30 });
const saved = savedProjectsWithKeys;
const active = () => localStorage.getItem('healthchecks-pocket.active');
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const keyInput = () => screen.getByPlaceholderText('Paste API key') as HTMLInputElement;
const nameInput = () => screen.getByPlaceholderText('Home lab') as HTMLInputElement;
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const pingLogDaysSlider = () => screen.getByRole('slider', { name: /^Ping log:/ }) as HTMLInputElement;
const projectRows = () => [...document.querySelectorAll('.project-select-row')];

const WEB_NOTICE =
  "Not encrypted in the browser. The web version keeps your API key in this browser's local storage. For encrypted storage, use the Android app.";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

describe('first launch', () => {
  it('asks for an API key, with the storage notice, and enables Add only once a key is typed', async () => {
    fakeServer([]);
    const { user } = startApp({ projects: [] });
    await screen.findByText(/Paste a project API key from healthchecks.io/);
    expect(heading()).toBe('Healthchecks Pocket');
    expect(text(document.querySelector('.notice'))).toBe(WEB_NOTICE);
    expect(button('Add project')).toHaveProperty('disabled', true);
    await user.type(keyInput(), 'k');
    expect(button('Add project')).toHaveProperty('disabled', false);
  });

  it('saves the ping log days chosen on the slider, 7 unless moved', async () => {
    fakeServer([{ key: 'key-real', checks: [check] }]);
    const { user } = startApp({ projects: [] });
    await user.type(await screen.findByPlaceholderText('Home lab'), 'Servers');
    expect(pingLogDaysSlider()).toMatchObject({ value: '7', min: '1', max: '30' });
    expect(pingLogDaysSlider().getAttribute('aria-valuetext')).toBe('7 days');
    fireEvent.change(pingLogDaysSlider(), { target: { value: '14' } });
    expect(screen.getByText('Ping log: last 14 days')).toBeTruthy();
    await user.type(keyInput(), 'key-real');
    await user.click(button('Add project'));
    await waitFor(() => expect(saved()[0]).toMatchObject({ name: 'Servers', pingLogDays: 14 }));
  });

  it('"Try the demo" adds a demo project without any network request', async () => {
    const server = fakeServer([]);
    const { user } = startApp({ projects: [] });
    await user.click(await screen.findByRole('button', { name: 'No key yet? Try the demo' }));
    expect(keyInput().value).toBe('demo');
    await user.click(button('Add project'));
    await waitFor(() => expect(document.querySelectorAll('.check-row').length).toBe(6));
    expect(window.location.hash).toBe('#/');
    expect(saved()).toEqual([expect.objectContaining({ name: 'Demo project', apiKey: 'demo', readOnly: false })]);
    expect(server.requests).toEqual([]);
  });

  it('checks a real key against the API before saving, then opens the project', async () => {
    const server = fakeServer([{ key: 'key-real', checks: [check] }]);
    const { user } = startApp({ projects: [] });
    await user.type(await screen.findByPlaceholderText('Home lab'), 'Servers');
    await user.type(keyInput(), '  key-real  ');
    await user.click(button('Add project'));
    await waitFor(() => expect(document.querySelectorAll('.check-row').length).toBe(1));
    expect(server.requests[0]).toMatchObject({ method: 'GET', path: '/api/v3/checks/', key: 'key-real' });
    const [project] = saved();
    expect(project).toEqual({ id: expect.any(String), name: 'Servers', apiKey: 'key-real', readOnly: false, pingLogDays: 7 });
    expect(active()).toBe(project.id);
  });

  it('drops invisible characters a paste brings along (zero-width space, BOM, soft hyphen, direction mark)', async () => {
    const server = fakeServer([{ key: 'key-real', checks: [check] }]);
    const { user } = startApp({ projects: [] });
    await screen.findByPlaceholderText('Paste API key');
    fireEvent.change(keyInput(), { target: { value: '\u200bkey\u00ad-\ufeffreal\u200e ' } });
    await user.click(button('Add project'));
    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(server.requests[0].key).toBe('key-real');
    expect(saved()[0].apiKey).toBe('key-real');
  });

  it.each([
    ['key-réal', 'é'],
    ['key–real', '–'],
    ['key real', ' '],
  ])('refuses a key with a character a key can\'t have (%s), instead of saying the server can\'t be reached', async (pastedApiKey, unexpectedCharacter) => {
    const server = fakeServer([{ key: 'key-real', checks: [check] }]);
    startApp({ projects: [] });
    await screen.findByPlaceholderText('Paste API key');
    fireEvent.change(keyInput(), { target: { value: pastedApiKey } });
    fireEvent.click(button('Add project'));
    expect(text(await screen.findByRole('alert'))).toBe(
      `The API key has a character a key can't have ("${unexpectedCharacter}"). Copy it again from healthchecks.io.`,
    );
    expect(server.requests).toEqual([]);
    expect(saved()).toEqual([]);
  });

  it('keeps Add project off for a key of only invisible characters', async () => {
    fakeServer([]);
    startApp({ projects: [] });
    await screen.findByPlaceholderText('Paste API key');
    fireEvent.change(keyInput(), { target: { value: '\u200b\ufeff ' } });
    expect(button('Add project')).toHaveProperty('disabled', true);
  });

  it('names an unnamed project healthchecks.io and detects read-only keys', async () => {
    fakeServer([{ key: 'key-ro', checks: [readOnlyCheck] }]);
    const { user } = startApp({ projects: [] });
    await user.type(await screen.findByPlaceholderText('Paste API key'), 'key-ro');
    await user.click(button('Add project'));
    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(saved()[0]).toMatchObject({ name: 'healthchecks.io', readOnly: true });
  });

  it('rejects a bad key and saves nothing', async () => {
    fakeServer([{ key: 'key-real', checks: [check] }]);
    const { user } = startApp({ projects: [] });
    await user.type(await screen.findByPlaceholderText('Paste API key'), 'wrong');
    await user.click(button('Add project'));
    expect(text(await screen.findByRole('alert'))).toBe('API key rejected. Check it in Settings.');
    expect(saved()).toEqual([]);
    expect(button('Add project')).toHaveProperty('disabled', false);
  });

  it('asks for no server: every project is on healthchecks.io', async () => {
    fakeServer([]);
    startApp({ projects: [] });
    await screen.findByPlaceholderText('Paste API key');
    expect(screen.queryByRole('textbox', { name: /Server/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /self-hosted/ })).toBeNull();
  });

  it('explains when healthchecks.io can\'t be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { user } = startApp({ projects: [] });
    await user.type(await screen.findByPlaceholderText('Paste API key'), 'k');
    await user.click(button('Add project'));
    expect(text(await screen.findByRole('alert'))).toBe("Can't reach healthchecks.io. Check your connection.");
  });

  it('hides the key unless shown', async () => {
    fakeServer([]);
    const { user } = startApp({ projects: [] });
    await screen.findByPlaceholderText('Paste API key');
    expect(keyInput().type).toBe('password');
    await user.click(button('Show'));
    expect(keyInput().type).toBe('text');
    await user.click(button('Hide'));
    expect(keyInput().type).toBe('password');
  });
});

describe('settings', () => {
  const projects = () => projectRows().map((row) => text(row));
  const openSettings = async () => {
    const app = startApp({ projects: [home, work, makeProject({ id: 'p3', name: 'Demo', apiKey: 'demo' })], activeProjectId: 'p1', hash: '#/settings' });
    await waitFor(() => expect(projectRows()).toHaveLength(3));
    return app;
  };

  it('lists projects with key type and the end of the key; the active one is ticked', async () => {
    fakeServer([]);
    await openSettings();
    expect(heading()).toBe('Settings');
    expect(projects()).toEqual([
      'Home lab regular key · …home',
      'Work regular key · …1234',
      'Demo demo · …demo',
    ]);
    expect(projectRows().map((row) => !!row.querySelector('.project-active svg'))).toEqual([true, false, false]);
    expect(screen.queryByPlaceholderText('Paste API key')).toBeNull(); // adding is its own page
    expect(text(document.querySelector('.footnote'))).toBe(
      `API keys are stored only on this device (browser storage, not encrypted) and sent only to healthchecks.io. Version ${APP_VERSION}. Unofficial client, not affiliated with Healthchecks.io.`,
    );
  });

  it('tapping a project switches to it and opens its checks', async () => {
    fakeServer([{ key: 'key-work-1234', checks: [{ ...check, name: 'payroll' }] }]);
    const { user } = await openSettings();
    await user.click(projectRows()[1]);
    expect(window.location.hash).toBe('#/');
    expect(active()).toBe('p2');
    await waitFor(() => expect(text(document.querySelector('.check-name'))).toBe('payroll'));
  });

  it('links out to healthchecks.io for account matters', async () => {
    fakeServer([]);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    await openSettings();
    const links = [...document.querySelectorAll('.card-links .row-link')];
    expect(links.map((link) => text(link))).toEqual(['Dashboard, projects & integrations', 'Account settings', 'About API keys']);
    links.forEach((link) => fireEvent.click(link));
    expect(openSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://healthchecks.io/',
      'https://healthchecks.io/accounts/profile/',
      'https://healthchecks.io/docs/api/',
    ]);
  });

  describe('editing a project', () => {
    it('opens a prefilled form with the key hidden and the storage notice', async () => {
      fakeServer([]);
      const { user } = await openSettings();
      await user.click(screen.getByRole('link', { name: 'Edit Work' }));
      expect(window.location.hash).toBe('#/settings/project/p2');
      expect(heading()).toBe('Edit project');
      expect(nameInput().value).toBe('Work');
      expect(keyInput()).toMatchObject({ value: 'key-work-1234', type: 'password' });
      await waitFor(() => expect(text(document.querySelector('.notice'))).toBe(WEB_NOTICE));
      expect(screen.getAllByText(/Key type: regular key\. Changing the key re-checks it before saving\./)).toHaveLength(1);
    });

    it('renaming saves without re-checking the key', async () => {
      const server = fakeServer([]);
      const { user } = await openSettings();
      await user.click(screen.getByRole('link', { name: 'Edit Work' }));
      await user.clear(nameInput());
      await user.type(nameInput(), 'Office');
      await user.click(button('Save changes'));
      expect(window.location.hash).toBe('#/settings');
      await waitFor(() => expect(text(projectRows()[1])).toBe('Office regular key · …1234'));
      expect(saved()[1]).toMatchObject({ id: 'p2', name: 'Office', apiKey: 'key-work-1234', pingLogDays: 30 });
      expect(server.requests).toEqual([]);
    });

    it('the ping log slider starts at the saved days, and moving it saves without re-checking the key', async () => {
      const server = fakeServer([]);
      const { user } = await openSettings();
      await user.click(screen.getByRole('link', { name: 'Edit Work' }));
      expect(pingLogDaysSlider().value).toBe('30');
      fireEvent.change(pingLogDaysSlider(), { target: { value: '1' } });
      expect(screen.getByText('Ping log: last 1 day')).toBeTruthy();
      expect(pingLogDaysSlider().getAttribute('aria-valuetext')).toBe('1 day');
      await user.click(button('Save changes'));
      await waitFor(() => expect(saved()[1]).toMatchObject({ id: 'p2', pingLogDays: 1 }));
      expect(saved()[0].pingLogDays).toBe(7);
      expect(server.requests).toEqual([]);
    });

    it('a new key is checked first; a bad one is rejected and nothing changes', async () => {
      const server = fakeServer([{ key: 'key-new', checks: [readOnlyCheck] }]);
      const { user } = await openSettings();
      await user.click(screen.getByRole('link', { name: 'Edit Work' }));
      await user.clear(keyInput());
      await user.type(keyInput(), 'key-bad');
      await user.click(button('Save changes'));
      expect(text(await screen.findByRole('alert'))).toBe('API key rejected. Check it in Settings.');
      expect(saved()[1].apiKey).toBe('key-work-1234');

      await user.clear(keyInput());
      await user.type(keyInput(), 'key-new');
      await user.click(button('Save changes'));
      await waitFor(() => expect(saved()[1]).toMatchObject({ apiKey: 'key-new', readOnly: true }));
      expect(server.requests.map((request) => request.key)).toEqual(['key-bad', 'key-new']);
    });

    it('says so for a project that no longer exists', async () => {
      fakeServer([]);
      startApp({ projects: [home], hash: '#/settings/project/gone' });
      expect(await screen.findByText('That project no longer exists.')).toBeTruthy();
    });
  });

  describe('removing a project', () => {
    const remove = async (user: Awaited<ReturnType<typeof openSettings>>['user'], name: string) => {
      await user.click(screen.getByRole('link', { name: `Edit ${name}` }));
      await user.click(button('Remove project'));
    };

    it('asks first and does nothing if cancelled', async () => {
      fakeServer([]);
      const asked = answerConfirms(false);
      const { user } = await openSettings();
      await remove(user, 'Work');
      expect(asked).toEqual(['Remove "Work" from this device?']);
      expect(saved()).toHaveLength(3);
    });

    it('removes it; removing the open project switches to another', async () => {
      fakeServer([]);
      answerConfirms(true, true);
      const { user } = await openSettings();
      await remove(user, 'Work');
      await waitFor(() => expect(projectRows()).toHaveLength(2));
      expect(saved().map((project) => project.name)).toEqual(['Home lab', 'Demo']);
      expect(active()).toBe('p1');
      await remove(user, 'Home lab');
      await waitFor(() => expect(projectRows()).toHaveLength(1));
      expect(active()).toBe('p3');
    });

    it('removing the last project shows the empty list, pointing to Settings', async () => {
      fakeServer([]);
      answerConfirms(true);
      const { user } = startApp({ projects: [home], hash: '#/settings' });
      await user.click(await screen.findByRole('link', { name: 'Edit Home lab' }));
      await user.click(button('Remove project'));
      expect(await screen.findByText('Set up a project in Settings')).toBeTruthy();
      expect(window.location.hash).toBe('#/');
      expect(saved()).toEqual([]);
      expect(active()).toBeNull();
    });
  });

  describe('adding a project', () => {
    it('has its own page, with the storage notice', async () => {
      fakeServer([]);
      const { user } = await openSettings();
      await user.click(screen.getByRole('link', { name: 'Add project' }));
      expect(window.location.hash).toBe('#/settings/add');
      expect(heading()).toBe('Add project');
      expect(text(document.querySelector('.notice'))).toBe(WEB_NOTICE);
    });

    it('adds the project and opens it', async () => {
      fakeServer([{ key: 'key-third', checks: [{ ...check, name: 'third-check' }] }]);
      const { user } = await openSettings();
      await user.click(screen.getByRole('link', { name: 'Add project' }));
      await user.type(nameInput(), 'Third');
      await user.type(keyInput(), 'key-third');
      await user.click(button('Add project'));
      await waitFor(() => expect(text(document.querySelector('.check-name'))).toBe('third-check'));
      expect(saved().map((project) => project.name)).toEqual(['Home lab', 'Work', 'Demo', 'Third']);
      expect(active()).toBe(saved()[3].id);
    });
  });
});

describe('storage notice on the phone', () => {
  const original = platform.secretProtection;
  afterEach(() => {
    platform.secretProtection = original;
  });

  it.each([
    ['keystore', 'Android Keystore'],
    ['keychain', 'iOS Keychain'],
  ] as const)('%s: says the key is encrypted and must be re-added on a new phone', async (protection, store) => {
    platform.secretProtection = protection;
    fakeServer([]);
    startApp({ projects: [] });
    await screen.findByText(/Paste a project API key/);
    expect(text(document.querySelector('.notice'))).toBe(
      `Your API key is encrypted on this device with a key held in the ${store} (Capacitor Secure Storage plugin). ` +
        "That key never leaves this phone, so the API key isn't backed up or moved to a new phone. The project's name and settings are: on a new phone, you only paste the key again.",
    );
    expect(document.querySelector('.notice-warn')).toBeNull();
  });

  it('the settings footnote says keys are encrypted', async () => {
    platform.secretProtection = 'keystore';
    fakeServer([]);
    startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(text(document.querySelector('.footnote'))).toContain('stored only on this device (encrypted)'));
  });
});

describe('a project whose key secure storage failed to read', () => {
  const failNextKeyRead = () => vi.spyOn(platform, 'loadSecret').mockRejectedValueOnce(Object.assign(new Error('An OS error occurred (Keystore busy)'), { code: 'osError' }));

  it('says the key couldn\'t be read, not that it\'s needed; Try again loads it', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    failNextKeyRead();
    const { user } = startApp({ projects: [home], hash: '#/' });
    expect(text(await screen.findByRole('heading', { level: 2 }))).toBe('Couldn\'t read the API key for Home lab');
    expect(screen.getByRole('link', { name: 'Paste the key again' }).getAttribute('href')).toBe(`#/settings/project/${home.id}`);
    await user.click(button('Try again'));
    await waitFor(() => expect(document.querySelectorAll('.check-row')).toHaveLength(1));
  });

  it('says so in Settings and on the project\'s page', async () => {
    fakeServer([]);
    failNextKeyRead();
    startApp({ projects: [home], hash: `#/settings/project/${home.id}` });
    expect(text(await screen.findByText(/couldn't read it just now/))).toBe(
      "This project's API key is saved, but this phone's secure storage couldn't read it just now. Paste it again to use the project now, or go back and try again later.",
    );
    expect(screen.queryByText(/isn't on this device/)).toBeNull();
    window.location.hash = '#/settings';
    await waitFor(() => expect(projectRows()).toHaveLength(1));
    expect(text(projectRows()[0])).toBe("Home lab API key couldn't be read");
  });
});

describe('a project whose key isn\'t on this device (moved to a new phone)', () => {
  const keyless = { ...work, apiKey: '' };

  it('asks for the key instead of loading checks', async () => {
    const server = fakeServer([]);
    startApp({ projects: [keyless], hash: '#/' });
    expect(text(await screen.findByRole('heading', { level: 2 }))).toBe('Add the API key for Work');
    expect(screen.getByRole('link', { name: 'Add API key' }).getAttribute('href')).toBe('#/settings/project/p2');
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#/settings');
    expect(server.requests).toEqual([]);
  });

  it('shows "API key needed" in Settings', async () => {
    fakeServer([]);
    startApp({ projects: [home, keyless], hash: '#/settings' });
    await waitFor(() => expect(projectRows()).toHaveLength(2));
    expect(text(projectRows()[1])).toBe('Work API key needed');
  });

  it('takes the key on the edit page, checks it, and opens the project', async () => {
    const server = fakeServer([{ key: 'key-work-1234', checks: [check] }]);
    const { user } = startApp({ projects: [keyless], hash: '#/settings/project/p2' });
    expect(await screen.findByText(/This project's API key isn't on this device/)).toBeTruthy();
    expect(keyInput().value).toBe('');
    expect(document.querySelector('.notice')).not.toBeNull();
    expect(screen.queryByText(/Key type:/)).toBeNull();
    await user.type(keyInput(), 'key-work-1234');
    await user.click(button('Save changes'));
    await waitFor(() => expect(saved()[0].apiKey).toBe('key-work-1234'));
    expect(server.requests.map((request) => request.key)).toEqual(['key-work-1234']);
  });
});

describe('API key protection setting', () => {
  const original = platform.secretProtection;
  beforeEach(() => {
    platform.secretProtection = 'keystore';
  });
  afterEach(() => {
    platform.secretProtection = original;
  });
  const toggle = () => screen.getByRole('checkbox', { name: /Keep API keys on this device only/ }) as HTMLInputElement;
  const footnote = () => text(document.querySelector('.footnote'));

  it('is on by default, and isn\'t offered in the browser (nothing to encrypt with)', async () => {
    fakeServer([]);
    const { unmount } = startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(toggle().checked).toBe(true));
    expect(text(toggle().closest('.card'))).toContain('Encrypted with a key that never leaves this phone.');
    unmount();
    platform.secretProtection = 'none';
    startApp({ projects: [home], hash: '#/settings' });
    await screen.findByText('Settings');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('asks before turning it off, and does nothing if cancelled', async () => {
    fakeServer([]);
    const asked = answerConfirms(false);
    const { user } = startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(toggle().checked).toBe(true));
    await user.click(toggle());
    expect(asked[0]).toMatch(/^Save API keys unencrypted with your settings\?/);
    expect(asked[0]).toContain('Without a screen lock, Google backup isn\'t encrypted on your phone, so the keys are left out of it.');
    expect(asked[0]).toContain('Android 7 and 8 can\'t encrypt it at all: there, the keys go to Google in plain text.');
    expect(toggle().checked).toBe(true);
    expect(localStorage.getItem('healthchecks-pocket.carriedKeys')).toBeNull();
  });

  it('turned off, keys are saved with the settings so they move to a new phone; back on moves them back', async () => {
    fakeServer([]);
    answerConfirms(true);
    const { user } = startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(toggle().checked).toBe(true));
    await user.click(toggle());
    expect(toggle().checked).toBe(false);
    await waitFor(() => expect(JSON.parse(localStorage.getItem('healthchecks-pocket.carriedKeys')!)).toEqual({ p1: 'key-home' }));
    expect(localStorage.getItem('healthchecks-pocket.apiKey.p1')).toBeNull();
    expect(footnote()).toContain('API keys are saved with your settings (not encrypted)');
    expect(text(toggle().closest('.card'))).toContain('Without a screen lock they\'re left out of Google backup; on Android 7 and 8 they go to Google in plain text.');
    expect(text(toggle().closest('.card'))).toContain('your last backup keeps them until the next one, so change the keys if that matters.');

    await user.click(toggle());
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.apiKey.p1')).toBe('key-home'));
    expect(localStorage.getItem('healthchecks-pocket.carriedKeys')).toBeNull();
    expect(footnote()).toContain('API keys are stored only on this device (encrypted)');
  });

  it('when off (e.g. chosen in onboarding), the "encrypted" notice never shows, not even while the choice loads', async () => {
    localStorage.setItem('healthchecks-pocket.keys.deviceOnly', '0');
    fakeServer([]);
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      const green = document.querySelector('.notice:not(.notice-warn)');
      if (green) seen.push(green.textContent ?? '');
    });
    observer.observe(document.body, { childList: true, subtree: true });
    startApp({ projects: [] });
    await waitFor(() => expect(document.querySelector('.notice-warn')).not.toBeNull());
    observer.disconnect();
    expect(seen).toEqual([]);
    expect(text(document.querySelector('.notice'))).toContain('Your API key will be saved unencrypted');
  });

  it('editing a project reminds how its key is stored, following the setting', async () => {
    fakeServer([]);
    const { unmount } = startApp({ projects: [home], hash: '#/settings/project/p1' });
    await waitFor(() => expect(text(document.querySelector('.notice'))).toMatch(/^Your API key is encrypted on this device/));
    expect(document.querySelector('.notice-warn')).toBeNull();
    unmount();

    localStorage.setItem('healthchecks-pocket.keys.deviceOnly', '0');
    startApp({ projects: [home], hash: '#/settings/project/p1' });
    await waitFor(() => expect(text(document.querySelector('.notice-warn'))).toBe(
      'Your API key is saved unencrypted with your settings, so it moves to a new phone with Android backup and transfer. You chose this in Settings (API keys).',
    ));
  });

  it('when off, adding a project warns that its key is saved unencrypted', async () => {
    localStorage.setItem('healthchecks-pocket.keys.deviceOnly', '0');
    fakeServer([]);
    startApp({ projects: [home], hash: '#/settings/add' });
    await waitFor(() => expect(text(document.querySelector('.notice-warn'))).toBe(
      'Your API key will be saved unencrypted with your settings, so it moves to a new phone with Android backup and transfer. You chose this in Settings (API keys).',
    ));
  });
});

describe('appearance', () => {
  const picker = () => screen.getByRole('combobox', { name: /^Theme/ }) as HTMLSelectElement;
  const theme = () => document.documentElement.dataset.theme;

  it('offers four modes in a dropdown, Dark by default, and applies a choice at once', async () => {
    fakeServer([]);
    const { user } = startApp({ projects: [home], hash: '#/settings' });
    await screen.findByRole('combobox', { name: /^Theme/ });
    expect([...picker().options].map((option) => option.textContent))
      .toEqual(['Auto: dark from 19:00 to 07:00', 'Light', 'Dark', 'Follow system']);
    expect(picker().value).toBe('dark');
    expect(theme()).toBe('dark');

    await user.selectOptions(picker(), 'light');
    expect(theme()).toBe('light');
    expect(localStorage.getItem('healthchecks-pocket.theme')).toBe('light');
    await user.selectOptions(picker(), 'dark');
    expect(theme()).toBe('dark');
  });

  it('remembers the choice', async () => {
    localStorage.setItem('healthchecks-pocket.theme', 'dark');
    fakeServer([]);
    startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(picker().value).toBe('dark'));
    expect(theme()).toBe('dark');
  });

  it('has a titled dropdown for the theme and one for the background', async () => {
    fakeServer([]);
    startApp({ projects: [home], hash: '#/settings' });
    await screen.findByRole('combobox', { name: /^Theme/ });
    expect([...document.querySelectorAll('.appearance .field-title')].map((title) => title.textContent)).toEqual(['Theme', 'Background']);
    expect(document.querySelector('.appearance .hint')).toBeNull();
  });

  it('Background: breathing northern lights by default, or always, while loading, a heartbeat monitor, or none; applies at once and is remembered', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // jsdom has no canvas
    fakeServer([]);
    const first = startApp({ projects: [home], hash: '#/settings' });
    const background = () => screen.getByRole('combobox', { name: /^Background/ }) as HTMLSelectElement;
    await screen.findByRole('combobox', { name: /^Background/ });
    expect([...background().options].map((option) => option.textContent))
      .toEqual(['Northern lights, always', 'Northern lights while loading', 'Northern lights, breathing', 'Heartbeat monitor', 'None']);
    expect(background().value).toBe('breathing');
    expect(document.querySelector('.aurora')!.classList.contains('aurora-breathing')).toBe(true); // even with nothing loading

    await first.user.selectOptions(background(), 'always');
    expect(document.querySelector('.aurora')!.classList.contains('aurora-breathing')).toBe(false);
    await first.user.selectOptions(background(), 'heartbeat');
    expect(document.querySelector('.aurora')).toBeNull();
    expect(document.querySelector('.heartbeat')).not.toBeNull();
    expect(localStorage.getItem('healthchecks-pocket.lights')).toBe('heartbeat');
    first.unmount();

    const second = startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(background().value).toBe('heartbeat'));
    expect(document.querySelector('.heartbeat')).not.toBeNull();
    await second.user.selectOptions(background(), 'off');
    expect(document.querySelector('.aurora, .heartbeat')).toBeNull();
    expect(localStorage.getItem('healthchecks-pocket.lights')).toBe('off');
    second.unmount();

    startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(background().value).toBe('off'));
    expect(document.querySelector('.aurora, .heartbeat')).toBeNull();
  });

  it('auto follows the clock, and switches when the time comes', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T18:59:30'), shouldAdvanceTime: true });
    localStorage.setItem('healthchecks-pocket.theme', 'auto');
    fakeServer([]);
    startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(theme()).toBe('light'));
    vi.advanceTimersByTime(60_000);
    expect(theme()).toBe('dark');
  });

  it('follow system tracks the system setting as it changes', async () => {
    const listeners: (() => void)[] = [];
    const query = { matches: true, addEventListener: (_: string, listener: () => void) => listeners.push(listener), removeEventListener: () => {} };
    vi.stubGlobal('matchMedia', () => query);
    localStorage.setItem('healthchecks-pocket.theme', 'system');
    fakeServer([]);
    startApp({ projects: [home], hash: '#/settings' });
    await waitFor(() => expect(theme()).toBe('dark'));
    query.matches = false;
    listeners.forEach((listener) => listener());
    expect(theme()).toBe('light');
  });
});

describe('no projects (all removed)', () => {
  const noProjects = () => {
    localStorage.setItem('healthchecks-pocket.projects', '[]'); // had projects once
    return startApp({ projects: [] });
  };

  it('shows the empty list with a big hint and an arrow to Settings', async () => {
    fakeServer([]);
    noProjects();
    expect(text(await screen.findByText('Set up a project in Settings'))).toBe('Set up a project in Settings');
    expect(document.querySelector('.no-projects-title')!.textContent).toBe('Set up a project in Settings');
    expect(text(document.querySelector('.no-projects-text'))).toBe(
      'Tap up here, then Add project , to see your checks. No account yet? Try the demo there.',
    );
    expect(document.querySelector('.no-projects-arrow')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#/settings');
    expect(screen.queryByPlaceholderText('Paste API key')).toBeNull();
  });

  it('Settings, adding a project and Risky actions still work; a new project opens its checks', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    const { user } = noProjects();
    await user.click(await screen.findByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('link', { name: 'Risky actions' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Add project' }));
    await user.type(screen.getByPlaceholderText('Paste API key'), 'key-home');
    await user.click(button('Add project'));
    await waitFor(() => expect(text(document.querySelector('.check-name'))).toBe('backup-server'));
  });

  it('a fresh install (never had a project) gets the add-project form instead', async () => {
    fakeServer([]);
    startApp({ projects: [] });
    expect(await screen.findByText(/Paste a project API key/)).toBeTruthy();
    expect(screen.queryByText('Set up a project in Settings')).toBeNull();
  });
});
