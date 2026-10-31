/**
 * Pure helpers for the area box: request URLs, "show more" steps, and trimming a Wikipedia extract
 * for the hover card.
 */

/** Default box limits and their "show more" steps (global constraints), capped like the API. */
export const EVENTS_STEP = 25;
export const OTHERS_STEP = 30;
export const AREA_LIMIT_MAX = 200;

export type AreaRequest = { lat: number; lon: number; from: number; to: number; intent: "click" | "range"; eventsLimit: number; othersLimit: number };

export function areaUrl(q: AreaRequest): string {
  const p = new URLSearchParams({
    lat: String(q.lat),
    lon: String(q.lon),
    from: String(q.from),
    to: String(q.to),
    intent: q.intent,
    eventsLimit: String(q.eventsLimit),
    othersLimit: String(q.othersLimit),
  });
  return `/api/area?${p}`;
}

/** By Wikidata item: the server looks up the item's own Wikipedia title. */
export function summaryApiUrl(qid: string): string {
  return `/api/summary?${new URLSearchParams({ qid })}`;
}

export function wikidataUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}

/**
 * What to offer under a list: a button that raises the limit by one step (never past the cap), or,
 * at the cap, a plain count of the rest. `shown` can exceed `limit` when the API appended a story's
 * cited items.
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

export type Rect = { top: number; bottom: number; left: number; width: number };
/** Room a hover card needs below its name before it opens above instead (about its usual height). */
export const CARD_ROOM_PX = 240;

/**
 * Where a hover card goes, in the area box's coordinates (its padding box): across the list's width,
 * touching the name, below it when the viewport has room there (or more room than above), else above.
 * The box does not clip the card, so the viewport is the limit that matters.
 */
export function cardPlacement(name: Rect, box: Rect, list: Rect, viewportHeight: number): { left: number; width: number; top?: number; bottom?: number } {
  const across = { left: list.left - box.left, width: list.width };
  const roomBelow = viewportHeight - name.bottom;
  return roomBelow >= CARD_ROOM_PX || roomBelow >= name.top
    ? { ...across, top: name.bottom - box.top }
    : { ...across, bottom: box.bottom - name.top };
}
