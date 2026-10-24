import { APP_NAME } from '@/core/app';
import type { Project } from '@/core/projects/project';
import { Header } from '@/ui/components/Header';
import { ProjectForm } from '@/ui/pages/settings/ProjectForm';
import { useReportLoading } from '@/ui/state/loadingState';

/** First launch, after onboarding: add the first project. Still part of
 *  setting up, so the northern lights keep playing. */
export function FirstProject({ onAdd }: { onAdd: (project: Project) => Promise<void> }) {
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
