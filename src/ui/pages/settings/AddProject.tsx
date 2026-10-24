import type { Project } from '@/core/projects/project';
import { Header } from '@/ui/components/Header';
import { href } from '@/ui/routes';
import { ProjectForm } from './ProjectForm';

export function AddProject({ onAdd }: { onAdd: (project: Project) => Promise<void> }) {
  return (
    <>
      <Header title="Add project" back={href({ name: 'settings' })} />
      <main className="page">
        <ProjectForm onSave={onAdd} first />
      </main>
    </>
  );
}
