import { useState } from 'react';
import { webLinks } from '@/core/api/client';
import type { Project } from '@/core/api/types';
import { APP_VERSION } from '@/core/app';
import { hasApiKey } from '@/core/projects/savedProjects';
import { platform } from '@/platform';
import { ExternalLink } from '@/ui/components/ExternalLink';
import { Header } from '@/ui/components/Header';
import { CheckMarkIcon, ChevronIcon, EditIcon, PlusIcon } from '@/ui/components/InterfaceIcons';
import { href } from '@/ui/routes';
import { KeyProtection } from './KeyProtection';
import { keyKind } from './keyKind';
import { ThemePicker } from './ThemePicker';
import { UpdateSettings } from './UpdateSettings';

function keySummary(project: Project): string {
  if (project.apiKeyUnreadable) return "API key couldn't be read";
  return hasApiKey(project) ? `${keyKind(project)} · …${project.apiKey.slice(-4)}` : 'API key needed';
}

export function Settings({ projects, activeProjectId, onSelectProject, keepKeysOnDeviceOnly, onChangeKeepKeysOnDeviceOnly }: {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  /** As saved: the toggle only moves once the keys have moved. */
  keepKeysOnDeviceOnly: boolean;
  onChangeKeepKeysOnDeviceOnly: (chosenKeepKeysOnDeviceOnly: boolean) => Promise<void>;
}) {
  const [movingKeys, setMovingKeys] = useState(false);
  const [moveKeysError, setMoveKeysError] = useState<Error>();
  const changeKeepKeysOnDeviceOnly = (chosenKeepKeysOnDeviceOnly: boolean) => {
    setMovingKeys(true);
    setMoveKeysError(undefined);
    onChangeKeepKeysOnDeviceOnly(chosenKeepKeysOnDeviceOnly).catch(setMoveKeysError).finally(() => setMovingKeys(false));
  };
  const encrypted = platform.secretProtection !== 'none';
  return (
    <>
      <Header title="Settings" back={href({ name: 'list' })} />
      <main className="page">
        <h2 className="section-title">Projects</h2>
        <ul className="list">
          {projects.map((project) => (
            <li key={project.id} className="project-row">
              <button className="project-select-row" onClick={() => onSelectProject(project.id)}>
                <span className="project-active">{project.id === activeProjectId && <CheckMarkIcon />}</span>
                <span className="check-main">
                  <span className="check-name">{project.name}</span>
                  <span className="check-meta">{keySummary(project)}</span>
                </span>
              </button>
              <a className="edit-button" href={href({ name: 'project', projectId: project.id })} aria-label={`Edit ${project.name}`}>
                <EditIcon /> Edit
              </a>
            </li>
          ))}
          <li>
            <a className="add-project-row" href={href({ name: 'addProject' })}>
              <PlusIcon /> Add project
            </a>
          </li>
        </ul>

        <h2 className="section-title">Appearance</h2>
        <ThemePicker />

        {encrypted && (
          <KeyProtection keepKeysOnDeviceOnly={keepKeysOnDeviceOnly} onChange={changeKeepKeysOnDeviceOnly} saving={movingKeys} error={moveKeysError} />
        )}

        <UpdateSettings />

        <h2 className="section-title">On healthchecks.io</h2>
        <div className="card card-links">
          <ExternalLink url={webLinks.dashboard}>Dashboard, projects &amp; integrations</ExternalLink>
          <ExternalLink url={webLinks.accountSettings}>Account settings</ExternalLink>
          <ExternalLink url={webLinks.apiKeysHelp}>About API keys</ExternalLink>
        </div>

        <a className="row-link risky-link" href={href({ name: 'risky' })}>
          <span className="row-link-label">Risky actions</span>
          <ChevronIcon />
        </a>

        <p className="footnote">
          API keys are {!encrypted ? 'stored only on this device (browser storage, not encrypted)' : keepKeysOnDeviceOnly ? 'stored only on this device (encrypted)' : 'saved with your settings (not encrypted)'} and
          sent only to healthchecks.io. Version {APP_VERSION}. Unofficial client, not affiliated with
          Healthchecks.io.
        </p>
      </main>
    </>
  );
}
