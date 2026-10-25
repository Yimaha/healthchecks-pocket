import { useState } from 'react';
import type { Project } from '@/core/projects/project';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { Header } from '@/ui/components/Header';
import { href } from '@/ui/routes';
import { ProjectForm } from './ProjectForm';

export function ProjectEdit({ project, onSave, onRemove }: {
  project: Project;
  onSave: (editedProject: Project) => Promise<void>;
  onRemove: (projectId: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<Error>();
  const confirmAndRemove = () => {
    if (!confirm(`Remove "${project.name}" from this device?`)) {
      return;
    }
    setRemoving(true);
    setRemoveError(undefined);
    // On success this screen closes; on failure the project stays, and this says why.
    onRemove(project.id).catch((failure: Error) => {
      setRemoveError(failure);
      setRemoving(false);
    });
  };
  return (
    <>
      <Header title="Edit project" back={href({ name: 'settings' })} />
      <main className="page">
        <ProjectForm key={project.id} initial={project} onSave={onSave} />
        {removeError && <ErrorBanner error={removeError} />}
        <button className="button button-danger" disabled={removing} onClick={confirmAndRemove}>
          {removing ? 'Removing…' : 'Remove project'}
        </button>
      </main>
    </>
  );
}
