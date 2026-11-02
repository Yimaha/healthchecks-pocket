import { useCallback, useState, type ReactNode } from 'react';
import { failNextProjectLoad } from '@/core/diagnostics/simulatedFailures';
import type { Project } from '@/core/projects/project';
import { clearAllSavedData } from '@/core/storage/storage';
import { AppError, AppErrorBoundary } from './AppError';
import { FirstProject } from './FirstProject';
import { NeedsKey } from './NeedsKey';
import { NoProjects } from './NoProjects';
import { Startup } from './Startup';
import { AppBackground } from '@/ui/background/AppBackground';
import { AppSettingsContext, useAppSettingsState } from '@/ui/state/appSettingsState';
import { CheckDetail } from '@/ui/pages/check-detail/CheckDetail';
import { CheckList } from '@/ui/pages/check-list/CheckList';
import { Header } from '@/ui/components/Header';
import { IconPicker } from '@/ui/pages/icon-picker/IconPicker';
import { IconsContext, useIconsState } from '@/ui/state/checkIconsState';
import { LoadingContext, useLoadingState } from '@/ui/state/loadingState';
import { goBackTo, href, navigate as go, useRoute } from '@/ui/routes';
import { Onboarding } from '@/ui/pages/onboarding/Onboarding';
import { PingBody } from '@/ui/pages/ping-body/PingBody';
import { RiskyActions } from '@/ui/pages/risky-actions/RiskyActions';
import { AddProject } from '@/ui/pages/settings/AddProject';
import { ProjectEdit } from '@/ui/pages/settings/ProjectEdit';
import { Settings } from '@/ui/pages/settings/Settings';
import { ThemeContext, useThemeState } from '@/ui/state/themeState';
import { TimeZoneContext, useTimeZoneState } from '@/ui/state/timeZoneState';
import { ProjectsContext, useProjects, useProjectsState } from '@/ui/state/projectsState';
import { UpdateContext, useUpdateState } from '@/ui/state/updatesState';

export function App() {
  // A restart remounts everything (a new key), so every screen and setting starts again from what's saved, as on a launch.
  const [restartCount, setRestartCount] = useState(0);
  const restart = useCallback(() => setRestartCount((count) => count + 1), []);
  const resetApp = useCallback(async () => {
    await clearAllSavedData();
    go({ name: 'list' });
    restart();
  }, [restart]);
  // Start over on the check list, as on a launch: after a crash, so a screen that keeps crashing can be left.
  const restartFromList = useCallback(() => {
    go({ name: 'list' });
    restart();
  }, [restart]);
  return (
    <AppErrorBoundary key={restartCount} onTryAgain={restartFromList} onReset={resetApp}>
      <ScreensWithSharedState onReset={resetApp} onRestart={restartFromList} />
    </AppErrorBoundary>
  );
}

/** The state every screen shares (theme, updates, icons, projects, time zone, loading), the background, and the screen. */
function ScreensWithSharedState({ onReset, onRestart }: { onReset: () => Promise<void>; onRestart: () => void }) {
  const { reportLoading, loadTimes } = useLoadingState();
  const appSettings = useAppSettingsState();
  const timeZone = useTimeZoneState(appSettings);
  const theme = useThemeState(appSettings);
  const updates = useUpdateState(appSettings);
  const icons = useIconsState();
  const projects = useProjectsState(icons.forgetProject);

  return (
    <AppSettingsContext.Provider value={appSettings}>
    <ThemeContext.Provider value={theme}>
      <UpdateContext.Provider value={updates}>
        <IconsContext.Provider value={icons}>
        <ProjectsContext.Provider value={projects}>
        <TimeZoneContext.Provider value={timeZone}>
          <LoadingContext.Provider value={reportLoading}>
            <AppBackground mode={theme.background} {...loadTimes} />
            <ScreenForRoute onReset={onReset} onRestart={onRestart} />
          </LoadingContext.Provider>
        </TimeZoneContext.Provider>
        </ProjectsContext.Provider>
        </IconsContext.Provider>
      </UpdateContext.Provider>
    </ThemeContext.Provider>
    </AppSettingsContext.Provider>
  );
}

/** Shows the screen for the route (first-launch setup until that's done), and where to go after a change is saved. */
function ScreenForRoute({ onReset, onRestart }: { onReset: () => Promise<void>; onRestart: () => void }): ReactNode {
  const {
    projects, loadError, activeProjectId, activeProject, activeProjectApi: api, onboarded, neverHadProjects, keepKeysOnDeviceOnly,
    loadSavedProjectsAgain, finishOnboarding, selectProject, addProject, saveEditedProject, removeProject, removeAllProjects, changeKeepKeysOnDeviceOnly,
  } = useProjects();
  const route = useRoute();

  if (loadError) {
    return <AppError title="Couldn't load your projects" error={loadError} onTryAgain={loadSavedProjectsAgain} onReset={onReset} />;
  }
  if (!projects) {
    // Reading saved projects; on Android the first read after install also
    // sets up the Keystore key, which can take a moment.
    return <Startup />;
  }

  const addProjectAndShowIt = async (addedProject: Project) => {
    await addProject(addedProject);
    goBackTo({ name: 'list' });
  };

  if (!onboarded) {
    return <Onboarding onDone={finishOnboarding} />;
  }

  // The checks screens need a project (and its key).
  const screenWithoutProject = () => neverHadProjects ? <FirstProject onAdd={addProjectAndShowIt} /> : <NoProjects />;
  const needsKeyScreen = (projectWithoutKey: Project) => (
    <NeedsKey project={projectWithoutKey} projects={projects} onSwitchProject={selectProject} onTryAgain={loadSavedProjectsAgain} />
  );

  switch (route.name) {
    case 'check':
      if (!activeProject) {
        return screenWithoutProject();
      }
      return api ? <CheckDetail key={route.checkId} api={api} project={activeProject} checkId={route.checkId} /> : needsKeyScreen(activeProject);
    case 'ping':
      if (!activeProject) {
        return screenWithoutProject();
      }
      return api ? <PingBody api={api} checkId={route.checkId} pingNumber={route.pingNumber} /> : needsKeyScreen(activeProject);
    case 'icon':
      if (!activeProject) {
        return screenWithoutProject();
      }
      return api ? <IconPicker api={api} project={activeProject} checkId={route.checkId} /> : needsKeyScreen(activeProject);
    case 'settings':
      return (
        <Settings
          projects={projects}
          activeProjectId={activeProjectId}
          keepKeysOnDeviceOnly={keepKeysOnDeviceOnly}
          onChangeKeepKeysOnDeviceOnly={changeKeepKeysOnDeviceOnly}
        />
      );
    case 'addProject':
      return <AddProject onAdd={addProjectAndShowIt} />;
    case 'risky':
      return (
        <RiskyActions
          projects={projects}
          onRemoveProjects={async () => {
            await removeAllProjects();
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
            await saveEditedProject(editedProject);
            goBackTo({ name: 'settings' });
          }}
          onRemove={async (removedProjectId) => {
            // Settings while other projects are left; with none, the empty list.
            const otherProjectsLeft = projects.some((project) => project.id !== removedProjectId);
            await removeProject(removedProjectId);
            goBackTo({ name: otherProjectsLeft ? 'settings' : 'list' });
          }}
        />
      );
    }
    default:
      if (!activeProject) {
        return screenWithoutProject();
      }
      if (!api) {
        return needsKeyScreen(activeProject);
      }
      // key: switching projects starts a fresh list, with nothing carried over from the previous one.
      return <CheckList key={activeProject.id} api={api} project={activeProject} projects={projects} onSwitchProject={selectProject} onSaveProject={saveEditedProject} />;
  }
}
