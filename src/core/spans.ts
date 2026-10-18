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

/** The text cut at every start and end of every layer's spans, in reading order. Joining the pieces gives the text
 *  back unchanged; there are no empty pieces, so an empty text gives none. Two spans of one layer that touch stay
 *  apart, as two pieces, and a span cut by another layer's edge is over each of its pieces.
 *
 *  The caller names Infos, as in overlaySpans<LineSpanInfos>(...): it's never worked out from the layers passed in,
 *  so the pieces have the fields the caller declared, and layers that don't match them don't compile.
 *
 *  An example, which tests/unit/spans.test.ts runs:
 *
 *    text    "see https://a.example/x now"
 *             0   4    9           21 23   27
 *    link         [4─────────────────────23)        one span
 *    match   [0───────9)           [21───────27)    two spans
 *
 *  The cuts are the text's start and end and every span's: 0, 4, 9, 21, 23, 27. Each two cuts next to each other make
 *  a piece. For each piece, each layer's current span is checked, moving on to the next one once the piece starts at
 *  or after its end:
 *
 *    piece    text            link                              match
 *    [0,4)    "see "          [4,23) hasn't started: none       [0,9) is over it
 *    [4,9)    "https"         [4,23) is over it                 [0,9) is over it
 *    [9,21)   "://a.example"  [4,23) is over it                 [0,9) ended: on to [21,27), not started: none
 *    [21,23)  "/x"            [4,23) is over it                 [21,27) is over it
 *    [23,27)  " now"          [4,23) ended, and no more: none   [21,27) is over it
 *
 *  It's the two-pointer walk of https://leetcode.com/problems/interval-list-intersections/ (two sorted lists of
 *  intervals that don't overlap, one pointer each), for any number of lists, and keeping what no span is over too. */
export function overlaySpans<Infos extends object>(text: string, layers: SpanLayers<NoInfer<Infos>>): Piece<Infos>[] {
  // The layers' names, as in Infos: "link" and "match" in the example.
  const layerNames = Object.keys(layers) as (keyof Infos)[];

  // The cuts: the text's start and end, so the pieces cover all of it, then every span's start and end. A Set, so a
  // place where two spans start or end (a match ending where a link starts) is one cut, and no piece is empty.
  const cuts = new Set([0, text.length]);
  for (const layerName of layerNames) {
    for (const span of layers[layerName]) cuts.add(span.start).add(span.end);
  }
  // In reading order, compared as numbers: sort's default compares them as text, which puts 21 before 4.
  const sortedCuts = [...cuts].sort((first, second) => first - second);

  // For each layer, the index of its current span: its first span that hasn't ended by the piece being made. Pieces are
  // made in reading order and each layer's spans are in reading order, so an index only ever moves on.
  const currentSpanIndex = layerNames.map(() => 0);

  // A piece for each two cuts next to each other. Leaving out the first cut gives each piece's end, and an end's index
  // in that shorter list is the index in sortedCuts of the cut before it: the piece's start.
  return sortedCuts.slice(1).map((end, startIndex) => {
    const start = sortedCuts[startIndex];
    const spansOver: { [Layer in keyof Infos]?: Span<Infos[Layer]> } = {};
    layerNames.forEach((layerName, layerIndex) => {
      const spans = layers[layerName];
      // Move on from the spans that ended by this piece's start: a span's end isn't in it, so [0,9) is not over the
      // piece [9,21). Every piece after this one starts later still, so they're over none of those either.
      while (currentSpanIndex[layerIndex] < spans.length && spans[currentSpanIndex[layerIndex]].end <= start) {
        currentSpanIndex[layerIndex]++;
      }
      // The current span ends after this piece starts. Undefined when the layer has no spans left.
      const span = spans[currentSpanIndex[layerIndex]];
      // It's over the piece if it started by the piece's start, and then over all of the piece: every span's start and
      // end is a cut, so none starts or ends inside a piece.
      if (span && span.start <= start) spansOver[layerName] = span;
    });
    // The piece's text, and the span over it from each layer that has one. A layer with none has no field.
    return { text: text.slice(start, end), ...spansOver };
  });
}
