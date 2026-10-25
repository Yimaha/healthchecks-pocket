// Spans: what one finder says about stretches of a text, and laying several finders' spans over the same text.
// Each finder reads the whole text on its own and knows nothing of the others; overlaySpans then cuts the text where
// any of their spans starts or ends, so the pieces can be drawn with everything each finder said about them.

/** A stretch of a text, from start up to (not including) end, in its UTF-16 units, and what a finder says about it. */
export interface Span<Info> {
  start: number;
  end: number;
  info: Info;
}

/** One finder's spans for each layer name, in reading order and not overlapping one another. Infos names the layers
 *  and what each one's spans say: { link: Link; match: number } gives { link: Span<Link>[]; match: Span<number>[] }. */
export type SpanLayers<Infos> = { [Layer in keyof Infos]: readonly Span<Infos[Layer]>[] };

/** A piece of a text no span starts or ends inside, with the span over it from each layer that has one: for
 *  { link: Link; match: number }, it's { text: string; link?: Span<Link>; match?: Span<number> }. */
export type Piece<Infos> = { text: string } & { [Layer in keyof Infos]?: Span<Infos[Layer]> };

/** The text cut at every start and end of every layer's spans, in reading order, each piece with the span over it
 *  from each layer. The caller names Infos, as in overlaySpans<LineSpanInfos>(...): it's never inferred.
 *
 *    text    "see https://a.example/x now"
 *             0   4    9           21 23   27
 *    link         [4─────────────────────23)
 *    match   [0───────9)           [21───────27)
 *
 *    piece           link     match
 *    "see "          –        [0,9)
 *    "https"         [4,23)   [0,9)
 *    "://a.example"  [4,23)   –
 *    "/x"            [4,23)   [21,27)
 *    " now"          –        [21,27)
 *
 *  Run in tests/unit/spans.test.ts. The two-pointer walk of https://leetcode.com/problems/interval-list-intersections/,
 *  for any number of lists. */
export function overlaySpans<Infos extends object>(text: string, layers: SpanLayers<NoInfer<Infos>>): Piece<Infos>[] {
  const layerNames = Object.keys(layers) as (keyof Infos)[];
  const cuts = new Set([0, text.length]);
  for (const layerName of layerNames) {
    for (const span of layers[layerName]) {
      cuts.add(span.start).add(span.end);
    }
  }
  const sortedCuts = [...cuts].sort((first, second) => first - second);
  const currentSpanIndex = layerNames.map(() => 0);
  // Each two cuts next to each other make a piece: an end's index in slice(1) is its start's index in sortedCuts.
  return sortedCuts.slice(1).map((end, startIndex) => {
    const start = sortedCuts[startIndex];
    const spansOver: { [Layer in keyof Infos]?: Span<Infos[Layer]> } = {};
    layerNames.forEach((layerName, layerIndex) => {
      const spans = layers[layerName];
      // Skip spans that ended by this piece's start (end isn't in a span); no later piece needs them either.
      while (currentSpanIndex[layerIndex] < spans.length && spans[currentSpanIndex[layerIndex]].end <= start) {
        currentSpanIndex[layerIndex]++;
      }
      const span = spans[currentSpanIndex[layerIndex]];
      // A span that started by the piece's start is over all of it, as every span's start and end is a cut.
      if (span && span.start <= start) {
        spansOver[layerName] = span;
      }
    });
    return { text: text.slice(start, end), ...spansOver };
  });
}
