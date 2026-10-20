import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasKey, keysDeviceOnly, loadAccounts, saveAccounts, saveActiveProject, setKeysDeviceOnly } from '../core/accounts';
import { createApi } from '../core/api';
import { APP_NAME } from '../core/app';
import { failNextProjectLoad, throwIfProjectLoadShouldFail } from '../core/debug';
import { resolveTimeZone, SYSTEM_TZ } from '../core/timezones';
import type { Account } from '../core/types';
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
  const [accounts, setAccounts] = useState<Account[]>();
  const [loadError, setLoadError] = useState<Error>();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  // Never had a project (first launch): the add-project form. Had some and
  // removed them all: the empty list, pointing to Settings.
  const [fresh, setFresh] = useState(true);
  // "Keep API keys on this device only", as saved; every save of the projects keeps their keys this way.
  const [keepKeysOnDevice, setKeepKeysOnDevice] = useState(true);
  const route = useRoute();

  const loadSavedProjects = useCallback(() => {
    // A failure asked for in Risky actions > Debug stands in for loadAccounts failing.
    const accountsLoaded = throwIfProjectLoadShouldFail().then(loadAccounts);
    const savedData = [accountsLoaded, settings.get('onboarded'), settings.get('projects'), keysDeviceOnly()] as const;
    Promise.all(savedData).then(([{ accounts, activeId }, done, saved, savedKeepKeysOnDevice]) => {
      setFresh(saved === null);
      // Installs from before onboarding existed already have projects: they
      // skip it. A restored phone has the flag from the backup.
      if (!done && accounts.length) void settings.set('onboarded', '1').catch(() => {});
      setOnboarded(!!done || accounts.length > 0);
      setKeepKeysOnDevice(savedKeepKeysOnDevice);
      setAccounts(accounts);
      setActiveId(activeId);
    }, setLoadError);
  }, []);
  useEffect(loadSavedProjects, [loadSavedProjects]);
  const tryLoadingSavedProjectsAgain = () => {
    setLoadError(undefined);
    loadSavedProjects();
  };

  /** Save the projects, then show them; if saving fails, nothing on screen changes and the caller shows the error. */
  async function update(nextAccounts: Account[], nextActiveId: string | null): Promise<void> {
    try {
      await saveAccounts(nextAccounts, nextActiveId, keepKeysOnDevice);
    } catch (saveError) {
      throw new Error(`Couldn't save on this device: ${(saveError as Error).message}`);
    }
    setFresh(false);
    setAccounts(nextAccounts);
    setActiveId(nextActiveId);
  }

  // Which project opens next time is a view choice, like the time zone: a failed save of it isn't worth an error.
  function selectProject(projectId: string) {
    setActiveId(projectId);
    void saveActiveProject(projectId).catch(() => {});
  }

  async function changeKeepKeysOnDevice(nextKeepKeysOnDevice: boolean): Promise<void> {
    try {
      await setKeysDeviceOnly(nextKeepKeysOnDevice, accounts ?? [], activeId);
    } catch (moveError) {
      throw new Error(`Couldn't move your API keys: ${(moveError as Error).message}`);
    }
    setKeepKeysOnDevice(nextKeepKeysOnDevice);
  }

  const account = accounts?.find((account) => account.id === activeId);
  const api = useMemo(() => (account && hasKey(account) ? createApi(account) : null), [account]);

  if (loadError) {
    return <AppError title="Couldn't load your projects" error={loadError} onTryAgain={tryLoadingSavedProjectsAgain} onReset={onReset} />;
  }
  if (!accounts) {
    // Reading saved projects; on Android the first read after install also
    // sets up the Keystore key, which can take a moment.
    return <Startup />;
  }

  const add = async (account: Account) => {
    await update([...accounts, account], account.id);
    goBackTo({ name: 'list' });
  };

  if (!onboarded) {
    return (
      <Onboarding
        onDone={(onboardingKeepKeysOnDevice) => {
          setKeepKeysOnDevice(onboardingKeepKeysOnDevice);
          setOnboarded(true);
        }}
      />
    );
  }

  // The checks screens need a project (and its key).
  const noProject = () => fresh ? <FirstProject onAdd={add} /> : <NoProjects />;

  switch (route.name) {
    case 'check':
      if (!account) return noProject();
      return api ? <CheckDetail key={route.id} api={api} account={account} id={route.id} /> : <NeedsKey account={account} onTryAgain={tryLoadingSavedProjectsAgain} />;
    case 'ping':
      if (!account) return noProject();
      return api ? <PingBody api={api} id={route.id} pingNumber={route.pingNumber} /> : <NeedsKey account={account} onTryAgain={tryLoadingSavedProjectsAgain} />;
    case 'icon':
      if (!account) return noProject();
      return api ? <IconPicker api={api} account={account} id={route.id} /> : <NeedsKey account={account} onTryAgain={tryLoadingSavedProjectsAgain} />;
    case 'settings':
      return (
        <Settings
          accounts={accounts}
          activeId={activeId}
          onSelect={(id) => {
            selectProject(id);
            go({ name: 'list' });
          }}
          keysDeviceOnly={keepKeysOnDevice}
          onKeysDeviceOnly={changeKeepKeysOnDevice}
        />
      );
    case 'addProject':
      return <AddProject onAdd={add} />;
    case 'risky':
      return (
        <RiskyActions
          accounts={accounts}
          onRemoveProjects={async () => {
            await update([], null);
            accounts.forEach((account) => icons.forgetProject(account.id));
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
      const editing = accounts.find((account) => account.id === route.id);
      if (!editing) {
        return (
          <>
            <Header title="Edit project" back={href({ name: 'settings' })} />
            <main className="page"><p className="empty">That project no longer exists.</p></main>
          </>
        );
      }
      return (
        <ProjectEdit
          account={editing}
          onSave={async (account) => {
            await update(accounts.map((existing) => (existing.id === account.id ? account : existing)), activeId);
            goBackTo({ name: 'settings' });
          }}
          onRemove={async (id) => {
            const remainingAccounts = accounts.filter((account) => account.id !== id);
            let nextActiveId: string | null;
            if (activeId !== id) {
              // Another project was open: it stays open.
              nextActiveId = activeId;
            } else if (remainingAccounts.length > 0) {
              // The open project was removed: open the first one left.
              nextActiveId = remainingAccounts[0].id;
            } else {
              // None left.
              nextActiveId = null;
            }
            await update(remainingAccounts, nextActiveId);
            icons.forgetProject(id);
            if (remainingAccounts.length > 0) {
              goBackTo({ name: 'settings' });
            } else {
              goBackTo({ name: 'list' });
            }
          }}
        />
      );
    }
    default:
      if (!account) return noProject();
      if (!api) return <NeedsKey account={account} onTryAgain={tryLoadingSavedProjectsAgain} />;
      // key: switching projects starts a fresh list, with nothing carried over from the previous one.
      return <CheckList key={account.id} api={api} account={account} accounts={accounts} onSwitch={selectProject} />;
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
function FirstProject({ onAdd }: { onAdd: (account: Account) => Promise<void> }) {
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
