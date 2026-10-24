import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createApi, type HealthchecksApi } from '@/core/api/client';
import { throwIfProjectLoadShouldFail } from '@/core/diagnostics/simulatedFailures';
import type { Project } from '@/core/projects/project';
import { hasApiKey, loadKeepKeysOnDeviceOnly, loadProjects, saveActiveProject, saveKeepKeysOnDeviceOnly, saveProjects } from '@/core/projects/savedProjects';
import { settings } from '@/core/storage/storage';

// The saved projects, which one is open, and whether first-launch setup is done. App provides them: the route switch
// picks a screen from them, and Settings, onboarding and risky actions change them. Saving is done here; where to go
// after a save is the route switch's choice.

export interface ProjectsState {
  /** The saved projects, or undefined while they're read at launch. */
  projects: Project[] | undefined;
  /** Why reading the saved projects failed. */
  loadError: Error | undefined;
  activeProjectId: string | null;
  activeProject: Project | undefined;
  /** The active project's API client; null without an active project or its key. */
  activeProjectApi: HealthchecksApi | null;
  /** First-launch setup (onboarding) is done, or was never needed. */
  onboarded: boolean;
  /** Never had a project (first launch): the add-project form. Had some and removed them all: the empty list, pointing
   *  to Settings. */
  neverHadProjects: boolean;
  /** "Keep API keys on this device only", as saved; every save of the projects keeps their keys this way. */
  keepKeysOnDeviceOnly: boolean;
  loadSavedProjectsAgain: () => void;
  finishOnboarding: (chosenKeepKeysOnDeviceOnly: boolean) => void;
  selectProject: (projectId: string) => void;
  /** Each save below throws if it fails, and then changes nothing, so the screen can say why. */
  addProject: (addedProject: Project) => Promise<void>;
  saveEditedProject: (editedProject: Project) => Promise<void>;
  removeProject: (removedProjectId: string) => Promise<void>;
  removeAllProjects: () => Promise<void>;
  changeKeepKeysOnDeviceOnly: (chosenKeepKeysOnDeviceOnly: boolean) => Promise<void>;
}

// Only App provides it, around every screen: null means a screen is outside App.
export const ProjectsContext = createContext<ProjectsState | null>(null);

export function useProjects(): ProjectsState {
  const projectsState = useContext(ProjectsContext);
  if (!projectsState) throw new Error('useProjects needs the ProjectsContext that App provides');
  return projectsState;
}

/** Reads the saved projects at launch, and saves every change. `forgetProjectIcons`: drops a removed project's icons. */
export function useProjectsState(forgetProjectIcons: (projectId: string) => void): ProjectsState {
  const [projects, setProjects] = useState<Project[]>();
  const [loadError, setLoadError] = useState<Error>();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const [neverHadProjects, setNeverHadProjects] = useState(true);
  const [keepKeysOnDeviceOnly, setKeepKeysOnDeviceOnly] = useState(true);

  const loadSavedProjects = useCallback(() => {
    // A failure asked for in Risky actions > Debug stands in for loadProjects failing.
    const projectsLoaded = throwIfProjectLoadShouldFail().then(loadProjects);
    const savedProjectsAndSettings = [projectsLoaded, settings.get('onboarded'), settings.get('projects'), loadKeepKeysOnDeviceOnly()] as const;
    Promise.all(savedProjectsAndSettings).then(([{ projects: loadedProjects, activeProjectId: loadedActiveProjectId }, onboardedFlag, savedProjectsJson, savedKeepKeysOnDeviceOnly]) => {
      setNeverHadProjects(savedProjectsJson === null);
      // Installs from before onboarding existed already have projects: they
      // skip it. A restored phone has the flag from the backup.
      if (!onboardedFlag && loadedProjects.length) void settings.set('onboarded', '1').catch(() => {});
      setOnboarded(!!onboardedFlag || loadedProjects.length > 0);
      setKeepKeysOnDeviceOnly(savedKeepKeysOnDeviceOnly);
      setProjects(loadedProjects);
      setActiveProjectId(loadedActiveProjectId);
    }, setLoadError);
  }, []);
  useEffect(loadSavedProjects, [loadSavedProjects]);
  const loadSavedProjectsAgain = useCallback(() => {
    setLoadError(undefined);
    loadSavedProjects();
  }, [loadSavedProjects]);

  const finishOnboarding = useCallback((chosenKeepKeysOnDeviceOnly: boolean) => {
    setKeepKeysOnDeviceOnly(chosenKeepKeysOnDeviceOnly);
    setOnboarded(true);
  }, []);

  /** Save the projects, then show them; if saving fails, nothing on screen changes and the caller shows the error. */
  const saveAndShowProjects = useCallback(async (projectsToSave: Project[], activeProjectIdToSave: string | null): Promise<void> => {
    try {
      await saveProjects(projectsToSave, activeProjectIdToSave, keepKeysOnDeviceOnly);
    } catch (saveError) {
      throw new Error(`Couldn't save on this device: ${(saveError as Error).message}`);
    }
    setNeverHadProjects(false);
    setProjects(projectsToSave);
    setActiveProjectId(activeProjectIdToSave);
  }, [keepKeysOnDeviceOnly]);

  // Which project opens next time is a view choice, like the time zone: a failed save of it isn't worth an error.
  const selectProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    void saveActiveProject(projectId).catch(() => {});
  }, []);

  const addProject = useCallback(
    (addedProject: Project) => saveAndShowProjects([...(projects ?? []), addedProject], addedProject.id),
    [projects, saveAndShowProjects],
  );

  const saveEditedProject = useCallback(
    (editedProject: Project) => saveAndShowProjects((projects ?? []).map((project) => (project.id === editedProject.id ? editedProject : project)), activeProjectId),
    [projects, activeProjectId, saveAndShowProjects],
  );

  const removeProject = useCallback(async (removedProjectId: string) => {
    const remainingProjects = (projects ?? []).filter((project) => project.id !== removedProjectId);
    let activeProjectIdAfterRemoval: string | null;
    if (activeProjectId !== removedProjectId) {
      // Another project was open: it stays open.
      activeProjectIdAfterRemoval = activeProjectId;
    } else if (remainingProjects.length > 0) {
      // The open project was removed: open the first one left.
      activeProjectIdAfterRemoval = remainingProjects[0].id;
    } else {
      // None left.
      activeProjectIdAfterRemoval = null;
    }
    await saveAndShowProjects(remainingProjects, activeProjectIdAfterRemoval);
    forgetProjectIcons(removedProjectId);
  }, [projects, activeProjectId, saveAndShowProjects, forgetProjectIcons]);

  const removeAllProjects = useCallback(async () => {
    await saveAndShowProjects([], null);
    (projects ?? []).forEach((project) => forgetProjectIcons(project.id));
  }, [projects, saveAndShowProjects, forgetProjectIcons]);

  const changeKeepKeysOnDeviceOnly = useCallback(async (chosenKeepKeysOnDeviceOnly: boolean): Promise<void> => {
    try {
      await saveKeepKeysOnDeviceOnly(chosenKeepKeysOnDeviceOnly, projects ?? [], activeProjectId);
    } catch (moveError) {
      throw new Error(`Couldn't move your API keys: ${(moveError as Error).message}`);
    }
    setKeepKeysOnDeviceOnly(chosenKeepKeysOnDeviceOnly);
  }, [projects, activeProjectId]);

  const activeProject = projects?.find((project) => project.id === activeProjectId);
  const activeProjectApi = useMemo(() => (activeProject && hasApiKey(activeProject) ? createApi(activeProject) : null), [activeProject]);

  return useMemo(() => ({
    projects, loadError, activeProjectId, activeProject, activeProjectApi, onboarded, neverHadProjects, keepKeysOnDeviceOnly,
    loadSavedProjectsAgain, finishOnboarding, selectProject, addProject, saveEditedProject, removeProject, removeAllProjects, changeKeepKeysOnDeviceOnly,
  }), [
    projects, loadError, activeProjectId, activeProject, activeProjectApi, onboarded, neverHadProjects, keepKeysOnDeviceOnly,
    loadSavedProjectsAgain, finishOnboarding, selectProject, addProject, saveEditedProject, removeProject, removeAllProjects, changeKeepKeysOnDeviceOnly,
  ]);
}
