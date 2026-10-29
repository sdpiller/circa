/**
 * Pure helpers for the area box: request URLs, "show more" steps, and trimming a Wikipedia extract
 * for the hover card.
 */

/** Default box limits and their "show more" steps (global constraints), capped like the API. */
export const EVENTS_STEP = 25;
export const OTHERS_STEP = 30;
export const AREA_LIMIT_MAX = 200;

export type AreaRequest = { cell: string; from: number; to: number; eventsLimit: number; othersLimit: number; focus?: string };

export function areaUrl(q: AreaRequest): string {
  const p = new URLSearchParams({
    cell: q.cell,
    from: String(q.from),
    to: String(q.to),
    eventsLimit: String(q.eventsLimit),
    othersLimit: String(q.othersLimit),
  });
  if (q.focus) p.set("focus", q.focus);
  return `/api/area?${p}`;
}

export function summaryApiUrl(title: string): string {
  return `/api/summary?${new URLSearchParams({ title })}`;
}

export function wikidataUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}

/**
 * What to offer under a list: a button that raises the limit by one step (never past the cap), or,
 * at the cap, a plain count of the rest. `shown` can exceed `limit` by one when the API appended the
 * focus item.
 */
export function moreControl(
  shown: number,
  total: number,
  limit: number,
  step: number,
): { kind: "button"; n: number; next: number } | { kind: "text"; n: number } | null {
  if (total <= shown) return null;
  if (limit >= AREA_LIMIT_MAX) return { kind: "text", n: total - shown };
  const next = Math.min(limit + step, AREA_LIMIT_MAX);
  return { kind: "button", n: Math.min(total, next) - shown, next };
}

// Words that end in a full stop without ending a sentence: "c. 495", "St. Paul", "Dr. Smith".
const ABBREVIATIONS = new Set(["c", "ca", "cf", "st", "mt", "mr", "mrs", "ms", "dr", "jr", "sr", "vs", "fl", "approx"]);

function endsInAbbreviation(before: string): boolean {
  const word = (before.match(/\S+$/)?.[0] ?? "").replace(/^[("'“‘[]+/, "");
  if (/^\p{Lu}$/u.test(word)) return true; // an initial: "John F. Kennedy"
  if (/^(\p{L}\.)+\p{L}$/u.test(word)) return true; // "e.g.", "B.C.", "U.S."
  return ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * The first `n` sentences of plain text. A sentence ends at ".", "!", or "?" followed by a space and
 * a capital letter, a quotation mark, or a bracket, unless the full stop closes an abbreviation or
 * an initial. A heuristic: an abbreviation it does not know can end a sentence early.
 */
export function firstSentences(text: string, n = 2): string {
  const t = text.trim();
  let count = 0;
  for (const m of t.matchAll(/[.!?]+["”’)]?\s+(?=[\p{Lu}"“‘'([])/gu)) {
    if (m[0].startsWith(".") && endsInAbbreviation(t.slice(0, m.index))) continue;
    if (++count === n) return t.slice(0, m.index + m[0].trimEnd().length);
  }
  return t;
}
