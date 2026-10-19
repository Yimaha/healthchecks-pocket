import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { computeIconAssignmentKey, defaultIcon, forgetProject as withoutProject, iconsInUse, withDefaultIconsForNewChecks, type SavedCheckIcons, type IconRef } from '../core/icons';
import { settings } from '../core/storage';
import type { Check } from '../core/types';

// Which icon each check has, and the images the user uploaded. Loaded once,
// shared by the list, the check page and the icon picker.
// Only the check list adds icons (for checks it sees for the first time); only the user removes them.
// Stored as settings:
//   icons.assigned       { "<projectId>/<checkId>": IconRef }, saved when it changes (setting name kept: installed apps have their icons saved under it)
//   icons.uploads        [uploadId, ...]
//   icons.upload.<id>    one image each, written when uploaded and removed when deleted, so a save sends only that image to native storage (Android still rewrites its whole settings file)

export interface IconsState {
  loaded: boolean;
  savedIconsByCheck: SavedCheckIcons;
  uploads: Record<string, string>; // uploadId -> data URL
  /** A project's check list arrived: give new checks their default icon, and remember which checks are live. */
  assignIconsToNewChecks: (projectId: string, checks: Check[]) => void;
  /** The check's icon: its saved one, or (not saved yet) its default. */
  iconForCheck: (projectId: string, check: Check) => IconRef;
  /** Icons other live checks of the project use. */
  iconsUsedByOtherChecks: (projectId: string, exceptIconAssignmentKey: string) => Set<IconRef>;
  assign: (iconAssignmentKey: string, iconRef: IconRef) => void;
  addUpload: (dataUrl: string) => string;
  /** Delete an uploaded image; checks using it get their default again. */
  removeUpload: (uploadId: string) => void;
  forgetProject: (projectId: string) => void;
}

// Without a provider (a screen rendered on its own): nothing is saved, and checks show their default.
export const IconsContext = createContext<IconsState>({
  loaded: false,
  savedIconsByCheck: {},
  uploads: {},
  assignIconsToNewChecks: () => {},
  iconForCheck: (_projectId, check) => defaultIcon(check, new Set()),
  iconsUsedByOtherChecks: () => new Set(),
  assign: () => {},
  addUpload: () => '',
  removeUpload: () => {},
  forgetProject: () => {},
});
export const useIcons = () => useContext(IconsContext);

function parseJson<T>(raw: string | null): T | undefined {
  try {
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** The uploads, by id. 0.5.0 test builds kept them all in one value
 *  (icons.custom): move those to one key each, then delete the old value. */
async function loadUploads(): Promise<Record<string, string>> {
  let uploadIds = parseJson<string[]>(await settings.get('icons.uploads')) ?? [];
  const legacy = parseJson<Record<string, string>>(await settings.get('icons.custom'));
  if (legacy) {
    for (const [uploadId, dataUrl] of Object.entries(legacy)) await settings.set(`icons.upload.${uploadId}`, dataUrl);
    uploadIds = [...new Set([...uploadIds, ...Object.keys(legacy)])];
    await settings.set('icons.uploads', JSON.stringify(uploadIds));
    await settings.remove('icons.custom');
  }
  const images = await Promise.all(uploadIds.map((uploadId) => settings.get(`icons.upload.${uploadId}`)));
  // An id whose image is missing (e.g. the app stopped mid-delete) is skipped.
  return Object.fromEntries(uploadIds.flatMap((uploadId, index) => (images[index] ? [[uploadId, images[index]]] : [])));
}

export function useIconsState(): IconsState {
  const [loaded, setLoaded] = useState(false);
  const [savedIconsByCheck, setSavedIconsByCheck] = useState<SavedCheckIcons>({});
  const [uploads, setUploads] = useState<Record<string, string>>({});
  // Each project's check keys from its latest list, so deleted checks' icons don't count as in use.
  const [liveIconAssignmentKeys, setLiveIconAssignmentKeys] = useState<Record<string, Set<string>>>({});
  // What's on disk now: updated only once a write succeeds, so a failed one
  // is tried again with the next change.
  const savedIconsJsonOnDisk = useRef('{}');
  // The uploads as of the latest change, for writing the id list right away.
  const currentUploads = useRef<Record<string, string>>({});

  useEffect(() => {
    void Promise.all([settings.get('icons.assigned'), loadUploads()]).then(([savedIconsJson, loadedUploads]) => {
      setSavedIconsByCheck(parseJson<SavedCheckIcons>(savedIconsJson) ?? {});
      savedIconsJsonOnDisk.current = savedIconsJson ?? '{}';
      currentUploads.current = loadedUploads;
      setUploads(loadedUploads);
      setLoaded(true);
    });
  }, []);

  // SavedCheckIcons: saved whenever they change (after the first load).
  useEffect(() => {
    if (!loaded) return;
    const savedIconsJson = JSON.stringify(savedIconsByCheck);
    if (savedIconsJson === savedIconsJsonOnDisk.current) return;
    settings.set('icons.assigned', savedIconsJson).then(() => { savedIconsJsonOnDisk.current = savedIconsJson; }, () => {});
  }, [loaded, savedIconsByCheck]);

  const saveUploadIds = () => settings.set('icons.uploads', JSON.stringify(Object.keys(currentUploads.current)));

  const assignIconsToNewChecks = useCallback((projectId: string, checks: Check[]) => {
    const projectIconAssignmentKeys = new Set(checks.map((check) => computeIconAssignmentKey(projectId, check)));
    // Only when the list changed, so a refresh with the same checks doesn't re-render every screen.
    setLiveIconAssignmentKeys((current) => (haveSameKeys(current[projectId], projectIconAssignmentKeys) ? current : { ...current, [projectId]: projectIconAssignmentKeys }));
    setSavedIconsByCheck((current) => withDefaultIconsForNewChecks(current, projectId, checks));
  }, []);
  const iconForCheck = useCallback((projectId: string, check: Check) => {
    const savedIcon = savedIconsByCheck[computeIconAssignmentKey(projectId, check)];
    if (savedIcon) return savedIcon;
    // Not saved yet (the list adds it): show the default it would get.
    return defaultIcon(check, iconsInUse(savedIconsByCheck, projectId, liveIconAssignmentKeys[projectId]));
  }, [savedIconsByCheck, liveIconAssignmentKeys]);
  const iconsUsedByOtherChecks = useCallback(
    (projectId: string, exceptIconAssignmentKey: string) => iconsInUse(savedIconsByCheck, projectId, liveIconAssignmentKeys[projectId], exceptIconAssignmentKey),
    [savedIconsByCheck, liveIconAssignmentKeys],
  );
  const assign = useCallback((iconAssignmentKey: string, iconRef: IconRef) => {
    setSavedIconsByCheck((current) => ({ ...current, [iconAssignmentKey]: iconRef }));
  }, []);
  const addUpload = useCallback((dataUrl: string) => {
    // A random UUID won't repeat an existing upload's id, so there's no need to check.
    const uploadId = crypto.randomUUID();
    currentUploads.current = { ...currentUploads.current, [uploadId]: dataUrl };
    setUploads(currentUploads.current);
    // The image first, then the list: stopping in between leaves only an
    // unlisted image behind, never a listed one that's missing.
    settings.set(`icons.upload.${uploadId}`, dataUrl).then(saveUploadIds).catch(() => {});
    return uploadId;
  }, []);
  const removeUpload = useCallback((uploadId: string) => {
    const { [uploadId]: _removed, ...remaining } = currentUploads.current;
    currentUploads.current = remaining;
    setUploads(remaining);
    setSavedIconsByCheck((current) => Object.fromEntries(Object.entries(current).filter(([, iconRef]) => iconRef !== `custom:${uploadId}`)));
    saveUploadIds().then(() => settings.remove(`icons.upload.${uploadId}`)).catch(() => {});
  }, []);
  const forgetProject = useCallback((projectId: string) => {
    setSavedIconsByCheck((current) => withoutProject(current, projectId));
    setLiveIconAssignmentKeys(({ [projectId]: _forgotten, ...otherProjects }) => otherProjects);
  }, []);

  return useMemo(
    () => ({ loaded, savedIconsByCheck, uploads, assignIconsToNewChecks, iconForCheck, iconsUsedByOtherChecks, assign, addUpload, removeUpload, forgetProject }),
    [loaded, savedIconsByCheck, uploads, assignIconsToNewChecks, iconForCheck, iconsUsedByOtherChecks, assign, addUpload, removeUpload, forgetProject],
  );
}

function haveSameKeys(previous: Set<string> | undefined, next: Set<string>): boolean {
  if (!previous || previous.size !== next.size) return false;
  return [...next].every((key) => previous.has(key));
}
