// A ping body, made ready for its page in three steps, each its own:
//   readBody     once per body: its lines, and in each line its level (lineLevel) and its links (findLinks)
//   searchLines  once per search: the matches of the query in each line
//   assembleBody once per body and search: each line's text cut where a link or a match starts or ends (overlaySpans)
// The finders each read a whole line and know nothing of each other, so a match runs into a link as it would in any
// other text. Only assembleBody puts what they found together, and the page draws what it gives.

import { findAll } from 'highlight-words-core';
import { LinkifyIt } from 'linkify-it';
import { overlaySpans, type Span } from './spans';

/** The most of a body the page shows, in characters. A ping's body is a short summary of a run: a longer log belongs
 *  with the service that sent it. A longer body is shown cut, as plain text, since parsing it isn't worth the time. */
export const MAX_SHOWN_BODY_LENGTH = 10_000;

/** Severity of one line of a ping body, for highlighting. Recognises the
 *  common levelled-log styles: "[ERROR] x", "ERROR: x", "level=error". */
export type LineLevel = 'error' | 'warn' | 'info' | 'debug' | 'plain';

/** The words logs write for a level (matched in any case), and the highlighting each one gets. */
const LINE_LEVEL_BY_WORD = new Map<string, LineLevel>([
  ['error', 'error'], ['err', 'error'], ['fail', 'error'], ['fatal', 'error'], ['crit', 'error'], ['critical', 'error'],
  ['warn', 'warn'], ['warning', 'warn'],
  ['info', 'info'], ['ok', 'info'],
  ['debug', 'debug'], ['trace', 'debug'],
]);

export function lineLevel(line: string): LineLevel {
  // A prefix decides when there is one, even a word that isn't a level ("Note: level=error" stays plain).
  const levelWord = levelPrefixWord(line) ?? levelFieldValue(line) ?? '';
  return LINE_LEVEL_BY_WORD.get(levelWord.toLowerCase()) ?? 'plain';
}

/** The word in a line's "[ERROR] x" or "ERROR: x" prefix, after any indent; undefined when the line has none. */
function levelPrefixWord(line: string): string | undefined {
  const prefixMatch = /^\s*(?:\[\s*(?<bracketedWord>[a-z]+)\s*\]|(?<wordBeforeColon>[a-z]+):)/i.exec(line);
  return prefixMatch?.groups?.bracketedWord ?? prefixMatch?.groups?.wordBeforeColon;
}

/** The value of the first "level=error" field anywhere in the line; undefined when the line has none. */
function levelFieldValue(line: string): string | undefined {
  // A search of its own: in one regex with the prefix, "^\s*.*level=" retried every split of an indent (100k tabs: 15 s).
  return /\blevel=(?<levelValue>[a-z]+)/i.exec(line)?.groups?.levelValue;
}

/** An http(s) link in a ping body line, shown as its URL and opened in the browser. */
export interface Link {
  url: string;
}

/** Finds the http(s) links in a line, with linkify-it (markdown-it's link finder): no other schemes ("mailto:",
 *  "ftp:", "//") and no bare "example.com". It leaves out the punctuation of the sentence around a link, as in
 *  "see https://example.com/report.", but keeps the brackets a link opened, as in ".../wiki/Cron_(Unix)". */
const httpLinkFinder = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false })
  .add('mailto:', null)
  .add('ftp:', null)
  .add('//', null);

/** The http(s) links in a line, in reading order, each where its URL is in the line: "see https://example.com/a. Next"
 *  has the link "https://example.com/a" from 4 to 25. */
export function findLinks(line: string): Span<Link>[] {
  return (httpLinkFinder.match(line) ?? []).map((linkMatch) => ({
    start: linkMatch.index,
    end: linkMatch.lastIndex,
    info: { url: linkMatch.raw }, // as written; for http(s), linkify-it's url is the same text
  }));
}

/** One line of a ping body: its text as sent, its level and its links. */
export interface BodyLine {
  text: string;
  level: LineLevel;
  links: Span<Link>[];
}

/** A ping body as its page shows it: its lines, and whether it was cut to MAX_SHOWN_BODY_LENGTH. */
export interface ShownBody {
  lines: BodyLine[];
  isCut: boolean;
}

/** A body read line by line, with each line's level and links. A body longer than MAX_SHOWN_BODY_LENGTH is cut to that
 *  and not parsed: its lines are plain, with no links. */
export function readBody(body: string): ShownBody {
  if (body.length > MAX_SHOWN_BODY_LENGTH) {
    const lines = body.slice(0, MAX_SHOWN_BODY_LENGTH).split('\n').map((text): BodyLine => ({ text, level: 'plain', links: [] }));
    return { lines, isCut: true };
  }
  return { lines: body.split('\n').map((text) => ({ text, level: lineLevel(text), links: findLinks(text) })), isCut: false };
}

/** A search of a body's lines: each line's matches, whose info is the match's number, from 0 in reading order across
 *  the lines, and how many there are. */
export interface BodySearch {
  matchesByLine: Span<number>[][];
  count: number;
}

/** Finds the query in each line, in any case, as plain text (not a pattern), with no two matches overlapping, using
 *  highlight-words-core. Each line is searched whole, as one text, so a match can run over where a link starts or ends;
 *  it never runs from one line into the next. */
export function searchLines(lines: readonly string[], query: string): BodySearch {
  let count = 0;
  const matchesByLine = lines.map((line) => findAll({ searchWords: [query], textToHighlight: line })
    .filter((chunk) => chunk.highlight)
    .map(({ start, end }) => ({ start, end, info: count++ })));
  return { matchesByLine, count };
}

/** A line as its page draws it: its level, and its text in parts. */
export interface AssembledLine {
  level: LineLevel;
  parts: LinePart[];
}

/** Text, or a link: one part, so one element, even when a match's edge cuts it into pieces. */
export type LinePart = { kind: 'text'; pieces: LinePiece[] } | { kind: 'link'; url: string; pieces: LinePiece[] };

/** Text as sent, and the search match it's in, if any. */
export interface LinePiece {
  text: string;
  match?: PieceMatch;
}

/** A piece's match: its number, and whether the pieces before and after are in it too (a match cut by a link's edge),
 *  so their marks draw as one. */
export interface PieceMatch {
  number: number;
  joinsPrevious: boolean;
  joinsNext: boolean;
}

/** Each line with its links and the search's matches laid over its text: the search must be of these lines. */
export function assembleBody(lines: readonly BodyLine[], search: BodySearch): AssembledLine[] {
  return lines.map((line, lineIndex) => ({ level: line.level, parts: assembleLine(line, search.matchesByLine[lineIndex]) }));
}

/** What each layer assembleLine lays over a line says: a link's URL, a match's number. */
interface LineSpanInfos {
  link: Link;
  match: number;
}

/** A line's pieces (from overlaySpans) in parts: pieces in a row in one link make a link part, the others text parts.
 *  overlaySpans' example, with matches 0 and 1 (run in tests/unit/ping-body.test.ts):
 *
 *    piece           part                       match
 *    "see "          text                       0, joins next
 *    "https"         link https://a.example/x   0, joins previous
 *    "://a.example"  (same link)                –
 *    "/x"            (same link)                1, joins next
 *    " now"          text                       1, joins previous
 */
export function assembleLine(line: BodyLine, matches: readonly Span<number>[]): LinePart[] {
  const pieces = overlaySpans<LineSpanInfos>(line.text, { link: line.links, match: matches });
  const parts: LinePart[] = [];
  let lastLink: Span<Link> | undefined;
  for (const [pieceIndex, { text, link, match }] of pieces.entries()) {
    // The pieces of one match share its span, so a neighbour with the same span is in the same match.
    const piece: LinePiece = {
      text,
      match: match && {
        number: match.info,
        joinsPrevious: pieces[pieceIndex - 1]?.match === match,
        joinsNext: pieces[pieceIndex + 1]?.match === match,
      },
    };
    const lastPart = parts.at(-1);
    // The same link span as the piece before, or no link for both: the same part. Two links never merge.
    if (lastPart && link === lastLink) {
      lastPart.pieces.push(piece);
    } else {
      parts.push(link ? { kind: 'link', url: link.info.url, pieces: [piece] } : { kind: 'text', pieces: [piece] });
    }
    lastLink = link;
  }
  return parts;
}
