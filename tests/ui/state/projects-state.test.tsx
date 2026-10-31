// The saved projects as App provides them (useProjectsState), on their own: reading them at launch, and each change
// saved before it shows. (The screens that change them: tests/ui/pages/settings, tests/ui/app/save-failures.test.tsx.)

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { platform } from '@/platform';
import { useAppSettingsState } from '@/ui/state/appSettingsState';
import { useProjects, useProjectsState } from '@/ui/state/projectsState';
import { makeProject, savedProjectsWithKeys, seedSavedProjects } from '../../helpers';

const home = makeProject();
const work = makeProject({ id: 'p2', name: 'Work', apiKey: 'key-work' });

/** The hook with these projects saved and `activeProjectId` open, once they're read. */
async function renderProjectsState(savedProjects: ReturnType<typeof makeProject>[], activeProjectId: string) {
  seedSavedProjects(savedProjects);
  localStorage.setItem('healthchecks-pocket.active', activeProjectId);
  const forgetProjectIcons = vi.fn();
  const rendered = renderHook(() => useProjectsState(forgetProjectIcons, useAppSettingsState()));
  await waitFor(() => expect(rendered.result.current.projects).toBeDefined());
  return { ...rendered, forgetProjectIcons };
}

describe('useProjectsState', () => {
  it('reads the saved projects and opens the active one, with a client for its key', async () => {
    const { result } = await renderProjectsState([home, work], work.id);
    expect(result.current.projects).toEqual([home, work]);
    expect(result.current.activeProject).toEqual(work);
    expect(result.current.activeProjectApi).not.toBeNull();
    expect(result.current.onboarded).toBe(true);
    expect(result.current.neverHadProjects).toBe(false);
  });

  it('an install from before onboarding existed, with projects but no onboarded flag, skips onboarding and saves the flag', async () => {
    const { result } = await renderProjectsState([home], home.id);
    expect(result.current.onboarded).toBe(true);
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.onboarded')).toBe('1'));
  });

  it('finishing onboarding saves that it\'s done', async () => {
    const { result } = await renderProjectsState([], '');
    await waitFor(() => expect(result.current.onboarded).toBe(false));
    act(() => result.current.finishOnboarding(true));
    expect(result.current.onboarded).toBe(true);
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.onboarded')).toBe('1'));
  });

  it('removing the open project opens the first one left, and forgets the removed one\'s icons', async () => {
    const { result, forgetProjectIcons } = await renderProjectsState([home, work], work.id);
    await act(() => result.current.removeProject(work.id));
    expect(result.current.projects).toEqual([home]);
    expect(result.current.activeProjectId).toBe(home.id);
    expect(savedProjectsWithKeys()).toEqual([home]);
    expect(forgetProjectIcons).toHaveBeenCalledExactlyOnceWith(work.id);
  });

  it('removing every project forgets each one\'s icons, and leaves none open', async () => {
    const { result, forgetProjectIcons } = await renderProjectsState([home, work], home.id);
    await act(() => result.current.removeAllProjects());
    expect(result.current.projects).toEqual([]);
    expect(result.current.activeProject).toBeUndefined();
    expect(result.current.activeProjectApi).toBeNull();
    expect(forgetProjectIcons.mock.calls).toEqual([[home.id], [work.id]]);
  });

  it('a save that fails says why and changes nothing', async () => {
    const { result } = await renderProjectsState([home], home.id);
    vi.spyOn(platform, 'save').mockRejectedValueOnce(new Error('Storage full'));
    await act(() => expect(result.current.addProject(work)).rejects.toThrow("Couldn't save on this device: Storage full"));
    expect(result.current.projects).toEqual([home]);
    expect(result.current.activeProjectId).toBe(home.id);
  });
});

describe('useProjects', () => {
  it('outside App, which provides the projects, says so', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the error it rethrows
    expect(() => renderHook(() => useProjects())).toThrow('useProjects needs the ProjectsContext that App provides');
  });
});
