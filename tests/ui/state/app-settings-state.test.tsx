// The app settings as App shares them (useAppSettingsState), on their own: read once at launch, and each change shown
// at once and saved. (The screens that change them: tests/ui/pages/settings, tests/ui/pages/onboarding.)

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/core/app-settings/appSettingsStore';
import { platform } from '@/platform';
import { useAppSettingsState } from '@/ui/state/appSettingsState';

describe('useAppSettingsState', () => {
  it('shows the defaults until the saved settings are read, then those', async () => {
    localStorage.setItem('healthchecks-pocket.theme', 'light');
    const { result } = renderHook(() => useAppSettingsState());
    expect(result.current.appSettings).toEqual(DEFAULT_APP_SETTINGS);
    expect(result.current.appSettingsRead).toBe(false);
    await waitFor(() => expect(result.current.appSettings).toEqual({ ...DEFAULT_APP_SETTINGS, themeMode: 'light' }));
    expect(result.current.appSettingsRead).toBe(true);
  });

  it('shows a change at once, and saves only what changed', async () => {
    const { result } = renderHook(() => useAppSettingsState());
    act(() => result.current.changeAppSettings({ timeZoneChoice: 'Europe/Berlin' }));
    expect(result.current.appSettings.timeZoneChoice).toBe('Europe/Berlin');
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.timezone')).toBe('Europe/Berlin'));
    expect(Object.keys(localStorage)).toEqual(['healthchecks-pocket.timezone']);
  });

  it('keeps a change made while the saved settings are read', async () => {
    localStorage.setItem('healthchecks-pocket.theme', 'light');
    localStorage.setItem('healthchecks-pocket.lights', 'heartbeat');
    const { result } = renderHook(() => useAppSettingsState());
    act(() => result.current.changeAppSettings({ background: 'off' }));
    await waitFor(() => expect(result.current.appSettings.themeMode).toBe('light'));
    expect(result.current.appSettings.background).toBe('off');
  });

  it('keeps a change shown when it can\'t be saved', async () => {
    const saveToStorage = vi.spyOn(platform, 'save').mockRejectedValueOnce(new Error('Storage full'));
    const { result } = renderHook(() => useAppSettingsState());
    act(() => result.current.changeAppSettings({ background: 'off' }));
    await waitFor(() => expect(saveToStorage).toHaveBeenCalled());
    expect(result.current.appSettings.background).toBe('off');
  });

  it('keeps the defaults when the saved settings can\'t be read', async () => {
    const loadFromStorage = vi.spyOn(platform, 'load').mockRejectedValue(new Error('Storage unavailable'));
    const { result } = renderHook(() => useAppSettingsState());
    await waitFor(() => expect(result.current.appSettingsRead).toBe(true));
    expect(loadFromStorage).toHaveBeenCalled();
    expect(result.current.appSettings).toEqual(DEFAULT_APP_SETTINGS);
    loadFromStorage.mockRestore();
  });
});
