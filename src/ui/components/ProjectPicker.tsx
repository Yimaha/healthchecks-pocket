import type { Project } from '@/core/projects/project';

/** The open project above a screen: a dropdown to switch with several projects, else just its name. A project with
 *  a read-only key says so, as it shows less: "(read-only)" after its name in the dropdown, a label beside it alone. */
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
          {projects.map((projectOption) => (
            <option key={projectOption.id} value={projectOption.id}>{projectOption.name}{projectOption.readOnly && ' (read-only)'}</option>
          ))}
        </select>
      ) : (
        <>
          <span className="project-name">{project.name}</span>
          {project.readOnly && <span className="read-only-label">read-only</span>}
        </>
      )}
    </div>
  );
}
