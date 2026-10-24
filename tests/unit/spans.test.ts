import { describe, expect, it } from 'vitest';
import { overlaySpans, type Span } from '@/core/ping-body/spans';

describe('overlaySpans', () => {
  // overlaySpans' example:
  //
  //   text    "see https://a.example/x now"
  //            0   4    9           21 23   27
  //   link         [4─────────────────────23)        one span
  //   match   [0───────9)           [21───────27)    two spans
  interface ExampleInfos {
    link: string;
    match: number;
  }
  const text = 'see https://a.example/x now';
  const links: Span<string>[] = [{ start: 4, end: 23, info: 'link' }];
  const matches: Span<number>[] = [{ start: 0, end: 9, info: 0 }, { start: 21, end: 27, info: 1 }];

  it('cuts the text at every edge of every layer, and gives each piece the span of each layer over it', () => {
    expect(overlaySpans<ExampleInfos>(text, { link: links, match: matches })).toEqual([
      { text: 'see ', match: matches[0] },
      { text: 'https', link: links[0], match: matches[0] },
      { text: '://a.example', link: links[0] },
      { text: '/x', link: links[0], match: matches[1] },
      { text: ' now', match: matches[1] },
    ]);
  });

  it('gives the text back unchanged when the pieces are joined', () => {
    const pieces = overlaySpans<ExampleInfos>(text, { link: links, match: matches });
    expect(pieces.map((piece) => piece.text).join('')).toBe(text);
  });

  it('keeps two spans of one layer that touch apart, as two pieces', () => {
    const touching: Span<number>[] = [{ start: 0, end: 2, info: 0 }, { start: 2, end: 4, info: 1 }];
    expect(overlaySpans<{ match: number }>('aaaa', { match: touching })).toEqual([
      { text: 'aa', match: touching[0] },
      { text: 'aa', match: touching[1] },
    ]);
  });

  it('gives the whole text as one piece when no layer has a span, and no pieces for no text', () => {
    expect(overlaySpans<ExampleInfos>('plain', { link: [], match: [] })).toEqual([{ text: 'plain' }]);
    expect(overlaySpans<ExampleInfos>('', { link: [], match: [] })).toEqual([]);
  });
});
