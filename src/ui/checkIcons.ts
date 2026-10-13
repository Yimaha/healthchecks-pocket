import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { forgetProject as withoutProject, withDefaults, type Assignments, type IconRef } from '../core/icons';
import { settings } from '../core/storage';
import type { Check } from '../core/types';

// Which icon each check has, and the images the user uploaded. Loaded once,
// shared by the list, the check page and the icon picker. Stored as settings:
//   icons.assigned       { "<projectId>/<checkId>": IconRef }, saved when it changes
//   icons.uploads        [uploadId, ...]
//   icons.upload.<id>    one image each, written once when uploaded and
//                        removed when deleted, so a change never rewrites the others

export interface IconsState {
  loaded: boolean;
  assigned: Assignments;
  uploads: Record<string, string>; // uploadId -> data URL
  /** Give checks without an icon their default (and with `prune`, forget
   *  icons of the project's checks that are gone). */
  ensure: (projectId: string, checks: Check[], prune?: boolean) => void;
  assign: (assignmentKey: string, iconRef: IconRef) => void;
  addUpload: (dataUrl: string) => string;
  /** Delete an uploaded image; checks using it get their default again. */
  removeUpload: (uploadId: string) => void;
  forgetProject: (projectId: string) => void;
}

export const IconsContext = createContext<IconsState>({
  loaded: false,
  assigned: {},
  uploads: {},
  ensure: () => {},
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

const newUploadId = () => Math.random().toString(36).slice(2, 10);

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
  const [assigned, setAssigned] = useState<Assignments>({});
  const [uploads, setUploads] = useState<Record<string, string>>({});
  // What's on disk now: updated only once a write succeeds, so a failed one
  // is tried again with the next change.
  const savedAssigned = useRef('{}');
  // The uploads as of the latest change, for writing the id list right away.
  const currentUploads = useRef<Record<string, string>>({});

  useEffect(() => {
    void Promise.all([settings.get('icons.assigned'), loadUploads()]).then(([assignedText, loadedUploads]) => {
      setAssigned(parseJson<Assignments>(assignedText) ?? {});
      savedAssigned.current = assignedText ?? '{}';
      currentUploads.current = loadedUploads;
      setUploads(loadedUploads);
      setLoaded(true);
    });
  }, []);

  // Assignments: saved whenever they change (after the first load).
  useEffect(() => {
    if (!loaded) return;
    const assignedText = JSON.stringify(assigned);
    if (assignedText === savedAssigned.current) return;
    settings.set('icons.assigned', assignedText).then(() => { savedAssigned.current = assignedText; }, () => {});
  }, [loaded, assigned]);

  const saveUploadIds = () => settings.set('icons.uploads', JSON.stringify(Object.keys(currentUploads.current)));

  const ensure = useCallback((projectId: string, checks: Check[], prune = false) => {
    setAssigned((current) => withDefaults(current, projectId, checks, prune));
  }, []);
  const assign = useCallback((assignmentKey: string, iconRef: IconRef) => {
    setAssigned((current) => ({ ...current, [assignmentKey]: iconRef }));
  }, []);
  const addUpload = useCallback((dataUrl: string) => {
    let uploadId = newUploadId();
    while (uploadId in currentUploads.current) uploadId = newUploadId();
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
    setAssigned((current) => Object.fromEntries(Object.entries(current).filter(([, iconRef]) => iconRef !== `custom:${uploadId}`)));
    saveUploadIds().then(() => settings.remove(`icons.upload.${uploadId}`)).catch(() => {});
  }, []);
  const forgetProject = useCallback((projectId: string) => setAssigned((current) => withoutProject(current, projectId)), []);

  return useMemo(
    () => ({ loaded, assigned, uploads, ensure, assign, addUpload, removeUpload, forgetProject }),
    [loaded, assigned, uploads, ensure, assign, addUpload, removeUpload, forgetProject],
  );
}
