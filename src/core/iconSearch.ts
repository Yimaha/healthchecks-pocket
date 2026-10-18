// Searching the presets by name, for the icon picker. Apart from icons.ts, so the words it searches (Lucide's
// tags and the names in iconSearchTerms.ts) load with the picker, not when the app starts.

import { PRESETS, wordsOf, type Preset } from './icons';
import { SEARCH_TERMS } from './iconSearchTerms';
import { LUCIDE_TAGS } from './lucideTags';

const searchTermsByIcon = new Map<string, string[]>();
for (const [terms, iconIds] of SEARCH_TERMS) {
  for (const iconId of iconIds) searchTermsByIcon.set(iconId, [...(searchTermsByIcon.get(iconId) ?? []), terms]);
}

/** Each preset's words, from the closest to what it is to the loosest: its label's; with its name's and keywords;
 *  with its Lucide tags and search terms too. Worked out on the first search, not as the picker opens. */
let searchIndex: { preset: Preset; wordTiers: string[][] }[] | undefined;
const indexed = () => searchIndex ??= PRESETS.map((preset) => {
  const nameWords = [preset.label, preset.id, ...preset.keywords];
  return {
    preset,
    wordTiers: [
      wordsOf(preset.label),
      wordsOf(nameWords.join(' ')),
      wordsOf([...nameWords, LUCIDE_TAGS[preset.id] ?? '', ...(searchTermsByIcon.get(preset.id) ?? [])].join(' ')),
    ],
  };
});

/** The presets a search finds: each word typed starts a word of a preset's
 *  label, name, keywords, Lucide tags or search terms ("cloud up" finds Upload
 *  to cloud), or the words typed run together do ("home assistant" finds
 *  homeassistant). Those found by their label come first, then by their name
 *  or keywords, then by the rest; each in PRESETS order. */
export function searchPresets(query: string): Preset[] {
  const queryWords = wordsOf(query);
  if (queryWords.length === 0) return PRESETS;
  const runTogether = queryWords.join('');
  const matches = (words: string[]) =>
    queryWords.every((queryWord) => words.some((word) => word.startsWith(queryWord))) || words.some((word) => word.startsWith(runTogether));
  // The closest tier each preset matches in, if any.
  const tierOf = new Map(indexed().map(({ preset, wordTiers }) => [preset, wordTiers.findIndex(matches)]));
  return [0, 1, 2].flatMap((tier) => PRESETS.filter((preset) => tierOf.get(preset) === tier));
}
