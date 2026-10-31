import type { LaunchStep } from '@/core/launch/launchSequence';
import { settings } from '@/core/storage/storage';

function parseJsonOrUndefined<T>(raw: string | null): T | undefined {
  try {
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** 0.5.0 test builds kept every uploaded icon in one setting (icons.custom); later versions keep each in its own. */
export const moveUploadsFrom050TestBuilds: LaunchStep = {
  name: "Move 0.5.0 test builds' uploaded icons",
  runsAfter: [],
  needsToRun: async () => (await settings.get('icons.custom')) !== null,
  async run() {
    const uploadsFrom050 = parseJsonOrUndefined<Record<string, string>>(await settings.get('icons.custom'));
    // Damaged: left as it is, as before this was a launch step.
    if (!uploadsFrom050) {
      return;
    }
    // The images, then the list, then the old value: stopping in between leaves the old value, moved again next launch.
    for (const [uploadId, dataUrl] of Object.entries(uploadsFrom050)) {
      await settings.set(`icons.upload.${uploadId}`, dataUrl);
    }
    const uploadIds = parseJsonOrUndefined<string[]>(await settings.get('icons.uploads')) ?? [];
    await settings.set('icons.uploads', JSON.stringify([...new Set([...uploadIds, ...Object.keys(uploadsFrom050)])]));
    await settings.remove('icons.custom');
  },
};
