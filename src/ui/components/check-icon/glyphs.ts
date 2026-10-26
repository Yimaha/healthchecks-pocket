// A preset's Lucide glyph. The hand-picked presets' (presetGlyphs.ts) are part of the app; the other
// hundreds (moreGlyphs.ts) load on their own when the icon picker opens or a check uses one, so the app
// starts as fast as with the hand-picked ones alone.

import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GLYPHS } from './presetGlyphs';

let moreGlyphs: Record<string, LucideIcon> | undefined;
let loadingMoreGlyphs: Promise<void> | undefined;

/** Loads the other presets' glyphs, once; after a failure (a web page offline), the next call tries again. */
export function loadMoreGlyphs(): Promise<void> {
  loadingMoreGlyphs ??= import('./moreGlyphs').then(
    (module) => { moreGlyphs = module.MORE_GLYPHS; },
    (error: unknown) => {
      loadingMoreGlyphs = undefined;
      throw error;
    },
  );
  return loadingMoreGlyphs;
}

/** A preset's glyph: right away if it's loaded, otherwise once it is (its tile shows without it until then). */
export function useGlyph(presetId: string | undefined): LucideIcon | undefined {
  const glyph = presetId === undefined ? undefined : GLYPHS[presetId] ?? moreGlyphs?.[presetId];
  const [, setLoaded] = useState(false);
  useEffect(() => {
    if (presetId !== undefined && !glyph) {
      loadMoreGlyphs().then(() => setLoaded(true), () => {});
    }
  }, [presetId, glyph]);
  return glyph;
}
