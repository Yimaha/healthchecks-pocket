import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createApi } from '../core/api';
import { APP_NAME } from '../core/app';
import { failNextProjectLoad, throwIfProjectLoadShouldFail } from '../core/debug';
import { hasApiKey, loadKeepKeysOnDeviceOnly, loadProjects, saveActiveProject, saveKeepKeysOnDeviceOnly, saveProjects } from '../core/projects';
import { resolveTimeZone, SYSTEM_TZ } from '../core/timezones';
import type { Project } from '../core/types';
import { clearAllSavedData, settings } from '../core/storage';
import { AppError, AppErrorBoundary } from './AppError';
import { AppBackground } from './Background';
import { CheckDetail } from './CheckDetail';
import { CheckList } from './CheckList';
import { Header } from './common';
import { IconPicker } from './IconPicker';
import { IconsContext, useIcons, useIconsState } from './checkIcons';
import { LoadingContext, useReportLoading } from './loading';
import { goBackTo, href, navigate as go, useRoute } from './routes';
import { Onboarding } from './Onboarding';
import { PingBody } from './PingBody';
import { RiskyActions } from './RiskyActions';
import { AddProject, NeedsKey, NoProjects, ProjectEdit, ProjectForm, Settings } from './Settings';
import { ThemeContext, useThemeState } from './theme';
import { TimeZoneContext } from './timezone';
import { UpdateContext, useUpdateState } from './updates';

export function App() {
  // A new session remounts everything, so every screen and setting starts
  // from what's saved, as on a launch.
  const [session, setSession] = useState(0);
  const startNewSession = useCallback(() => setSession((count) => count + 1), []);
  const resetApp = useCallback(async () => {
    await clearAllSavedData();
    go({ name: 'list' });
    startNewSession();
  }, [startNewSession]);
  // Start over on the check list, as on a launch: after a crash, so a screen that keeps crashing can be left.
  const restartFromList = useCallback(() => {
    go({ name: 'list' });
    startNewSession();
  }, [startNewSession]);
  return (
    <AppErrorBoundary key={session} onTryAgain={restartFromList} onReset={resetApp}>
      <Session onReset={resetApp} onRestart={restartFromList} />
    </AppErrorBoundary>
  );
}

function Session({ onReset, onRestart }: { onReset: () => Promise<void>; onRestart: () => void }) {
  const [loads, setLoads] = useState(0);
  const [lastStart, setLastStart] = useState(0);
  const [lastEnd, setLastEnd] = useState(0);
  const reportLoading = useCallback((delta: 1 | -1) => {
    setLoads((count) => count + delta);
    if (delta > 0) setLastStart(performance.now());
    else setLastEnd(performance.now());
  }, []);
  const [tzChoice, setTzChoice] = useState(SYSTEM_TZ);
  useEffect(() => {
    void settings.get('timezone').then((saved) => { if (saved) setTzChoice(saved); });
  }, []);
  const timeZone = useMemo(() => ({
    choice: tzChoice,
    tz: resolveTimeZone(tzChoice),
    setChoice: (choice: string) => {
      setTzChoice(choice);
      void settings.set('timezone', choice).catch(() => {});
    },
  }), [tzChoice]);

  const theme = useThemeState();
  const updates = useUpdateState();
  const icons = useIconsState();

  return (
    <ThemeContext.Provider value={theme}>
      <UpdateContext.Provider value={updates}>
        <IconsContext.Provider value={icons}>
        <TimeZoneContext.Provider value={timeZone}>
          <LoadingContext.Provider value={reportLoading}>
            <AppBackground mode={theme.background} busy={loads > 0} lastStart={lastStart} lastEnd={lastEnd} />
            <Screens onReset={onReset} onRestart={onRestart} />
          </LoadingContext.Provider>
        </TimeZoneContext.Provider>
        </IconsContext.Provider>
      </UpdateContext.Provider>
    </ThemeContext.Provider>
  );
}

function Screens({ onReset, onRestart }: { onReset: () => Promise<void>; onRestart: () => void }): ReactNode {
  const icons = useIcons();
  const [projects, setProjects] = useState<Project[]>();
  const [loadError, setLoadError] = useState<Error>();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  // Never had a project (first launch): the add-project form. Had some and
  // removed them all: the empty list, pointing to Settings.
  const [fresh, setFresh] = useState(true);
  // "Keep API keys on this device only", as saved; every save of the projects keeps their keys this way.
  const [keepKeysOnDeviceOnly, setKeepKeysOnDeviceOnly] = useState(true);
  const route = useRoute();

  const loadSavedProjects = useCallback(() => {
    // A failure asked for in Risky actions > Debug stands in for loadProjects failing.
    const projectsLoaded = throwIfProjectLoadShouldFail().then(loadProjects);
    const savedProjectsAndSettings = [projectsLoaded, settings.get('onboarded'), settings.get('projects'), loadKeepKeysOnDeviceOnly()] as const;
    Promise.all(savedProjectsAndSettings).then(([{ projects: loadedProjects, activeProjectId: loadedActiveProjectId }, onboardedFlag, savedProjectsJson, savedKeepKeysOnDeviceOnly]) => {
      setFresh(savedProjectsJson === null);
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
  const tryLoadingSavedProjectsAgain = () => {
    setLoadError(undefined);
    loadSavedProjects();
  };

  /** Save the projects, then show them; if saving fails, nothing on screen changes and the caller shows the error. */
  async function saveAndShowProjects(projectsToSave: Project[], activeProjectIdToSave: string | null): Promise<void> {
    try {
      await saveProjects(projectsToSave, activeProjectIdToSave, keepKeysOnDeviceOnly);
    } catch (saveError) {
      throw new Error(`Couldn't save on this device: ${(saveError as Error).message}`);
    }
    setFresh(false);
    setProjects(projectsToSave);
    setActiveProjectId(activeProjectIdToSave);
  }

  // Which project opens next time is a view choice, like the time zone: a failed save of it isn't worth an error.
  function selectProject(projectId: string) {
    setActiveProjectId(projectId);
    void saveActiveProject(projectId).catch(() => {});
  }

  async function changeKeepKeysOnDeviceOnly(chosenKeepKeysOnDeviceOnly: boolean): Promise<void> {
    try {
      await saveKeepKeysOnDeviceOnly(chosenKeepKeysOnDeviceOnly, projects ?? [], activeProjectId);
    } catch (moveError) {
      throw new Error(`Couldn't move your API keys: ${(moveError as Error).message}`);
    }
    setKeepKeysOnDeviceOnly(chosenKeepKeysOnDeviceOnly);
  }

  const activeProject = projects?.find((project) => project.id === activeProjectId);
  const api = useMemo(() => (activeProject && hasApiKey(activeProject) ? createApi(activeProject) : null), [activeProject]);

  if (loadError) {
    return <AppError title="Couldn't load your projects" error={loadError} onTryAgain={tryLoadingSavedProjectsAgain} onReset={onReset} />;
  }
  if (!projects) {
    // Reading saved projects; on Android the first read after install also
    // sets up the Keystore key, which can take a moment.
    return <Startup />;
  }

  const addProject = async (addedProject: Project) => {
    await saveAndShowProjects([...projects, addedProject], addedProject.id);
    goBackTo({ name: 'list' });
  };

  if (!onboarded) {
    return (
      <Onboarding
        onDone={(onboardingKeepKeysOnDeviceOnly) => {
          setKeepKeysOnDeviceOnly(onboardingKeepKeysOnDeviceOnly);
          setOnboarded(true);
        }}
      />
    );
  }

  // The checks screens need a project (and its key).
  const noProject = () => fresh ? <FirstProject onAdd={addProject} /> : <NoProjects />;

  switch (route.name) {
    case 'check':
      if (!activeProject) return noProject();
      return api ? <CheckDetail key={route.checkId} api={api} project={activeProject} checkId={route.checkId} /> : <NeedsKey project={activeProject} onTryAgain={tryLoadingSavedProjectsAgain} />;
    case 'ping':
      if (!activeProject) return noProject();
      return api ? <PingBody api={api} checkId={route.checkId} pingNumber={route.pingNumber} /> : <NeedsKey project={activeProject} onTryAgain={tryLoadingSavedProjectsAgain} />;
    case 'icon':
      if (!activeProject) return noProject();
      return api ? <IconPicker api={api} project={activeProject} checkId={route.checkId} /> : <NeedsKey project={activeProject} onTryAgain={tryLoadingSavedProjectsAgain} />;
    case 'settings':
      return (
        <Settings
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={(projectId) => {
            selectProject(projectId);
            go({ name: 'list' });
          }}
          keepKeysOnDeviceOnly={keepKeysOnDeviceOnly}
          onChangeKeepKeysOnDeviceOnly={changeKeepKeysOnDeviceOnly}
        />
      );
    case 'addProject':
      return <AddProject onAdd={addProject} />;
    case 'risky':
      return (
        <RiskyActions
          projects={projects}
          onRemoveProjects={async () => {
            await saveAndShowProjects([], null);
            projects.forEach((project) => icons.forgetProject(project.id));
            go({ name: 'list' });
          }}
          onReset={onReset}
          onRestartFailingToLoad={async () => {
            await failNextProjectLoad();
            onRestart();
          }}
        />
      );
    case 'project': {
      const projectBeingEdited = projects.find((project) => project.id === route.projectId);
      if (!projectBeingEdited) {
        return (
          <>
            <Header title="Edit project" back={href({ name: 'settings' })} />
            <main className="page"><p className="empty">That project no longer exists.</p></main>
          </>
        );
      }
      return (
        <ProjectEdit
          project={projectBeingEdited}
          onSave={async (editedProject) => {
            await saveAndShowProjects(projects.map((project) => (project.id === editedProject.id ? editedProject : project)), activeProjectId);
            goBackTo({ name: 'settings' });
          }}
          onRemove={async (removedProjectId) => {
            const remainingProjects = projects.filter((project) => project.id !== removedProjectId);
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
            icons.forgetProject(removedProjectId);
            if (remainingProjects.length > 0) {
              goBackTo({ name: 'settings' });
            } else {
              goBackTo({ name: 'list' });
            }
          }}
        />
      );
    }
    default:
      if (!activeProject) return noProject();
      if (!api) return <NeedsKey project={activeProject} onTryAgain={tryLoadingSavedProjectsAgain} />;
      // key: switching projects starts a fresh list, with nothing carried over from the previous one.
      return <CheckList key={activeProject.id} api={api} project={activeProject} projects={projects} onSwitchProject={selectProject} />;
  }
}

/** While saved projects load (on Android the first read after install also
 *  sets up the Keystore key, which can take a moment). Counts as loading,
 *  so the northern lights play. */
function Startup() {
  useReportLoading(true);
  return (
    <main className="page startup" aria-busy="true">
      <img className="hero-icon" src="./icon-192.png" alt="" />
      <p role="status">Getting {APP_NAME} ready…</p>
    </main>
  );
}

/** First launch, after onboarding: add the first project. Still part of
 *  setting up, so the northern lights keep playing. */
function FirstProject({ onAdd }: { onAdd: (project: Project) => Promise<void> }) {
  useReportLoading(true);
  return (
    <>
      <Header title={APP_NAME} />
      <main className="page">
        <ProjectForm onSave={onAdd} first />
      </main>
    </>
  );
}
