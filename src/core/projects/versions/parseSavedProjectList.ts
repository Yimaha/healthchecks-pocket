import { DamagedProjectList } from './damagedProjectList';

/** A saved project list's entries that have an id, for a version's decoder to read the rest of. Every version saves the
 *  list as a JSON array of projects. Throws DamagedProjectList rather than reading a damaged list as empty: that would
 *  drop every project silently, and the next save, seeing none, would leave their API keys behind in secure storage
 *  for good. */
export function parseSavedProjectList(projectSettingsJson: string): { id: string }[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(projectSettingsJson);
  } catch {
    throw new DamagedProjectList();
  }
  if (!Array.isArray(parsedJson)) {
    throw new DamagedProjectList();
  }
  // Damaged entries (e.g. null) are dropped: one would otherwise stop every project from loading.
  return parsedJson.filter(hasStringId);
}

function hasStringId(entry: unknown): entry is { id: string } {
  return typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string';
}
