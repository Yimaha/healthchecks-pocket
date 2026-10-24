import type { Project } from '@/core/projects/project';

/** The open project above a screen: a dropdown to switch with several projects, else just its name. */
export function ProjectPicker({ project, projects, onSwitchProject }: {
  project: Project;
  projects: Project[];
  onSwitchProject: (projectId: string) => void;
}) {
  return (
    <div className="project-bar">
      <span className="project-bar-label">Project</span>
      {projects.length > 1 ? (
        <select className="project-picker" value={project.id} onChange={(event) => onSwitchProject(event.target.value)}>
          {projects.map((projectOption) => <option key={projectOption.id} value={projectOption.id}>{projectOption.name}</option>)}
        </select>
      ) : (
        <span className="project-name">{project.name}</span>
      )}
    </div>
  );
}
