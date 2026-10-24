import type { Project } from '@/core/projects/project';
import { DEMO_KEY } from '@/core/api/demo';

/** "demo", "read-only key" or "regular key": the kind of key a project has, as Settings and the project page say it. */
export function keyKind(project: Project): string {
  return project.apiKey === DEMO_KEY ? 'demo' : project.readOnly ? 'read-only key' : 'regular key';
}
