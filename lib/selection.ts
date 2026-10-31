/**
 * The selection: a stored point and a range, not a shape (spec 3.5). Pure, so the races between clicks,
 * drags and late answers are tested. The answer stays in the state after its question changes; the helpers
 * below decide what of it is still fit to show.
 */
import { areaUrl, EVENTS_STEP, OTHERS_STEP } from "./box.ts";
import type { AreaAnswer } from "./db/area.ts";
import type { Position } from "./geo/geometry.ts";
import type { Selection } from "./outline/resolve.ts";
import type { Intent } from "./stories/catalog.ts";
import type { YearRange } from "./time/index.ts";

export type AreaState = {
  point: Position | null;
  range: YearRange;
  intent: Intent;
  eventsLimit: number;
  othersLimit: number;
  answer: { url: string; body: AreaAnswer | null } | null;
  /** The next outline for this point moves the camera: a click or a story, until the point has its first answer. */
  fly: boolean;
};

export type AreaList = "events" | "others";

export type AreaAction =
  | { type: "click"; point: Position }
  | { type: "choose"; point: Position; range: YearRange }
  | { type: "drag"; range: YearRange }
  | { type: "more"; list: AreaList; next: number }
  | { type: "close" }
  | { type: "answered"; url: string; body: AreaAnswer | null };

export const initialArea: AreaState = {
  point: null,
  range: { from: -500, to: -300 },
  intent: "range",
  eventsLimit: EVENTS_STEP,
  othersLimit: OTHERS_STEP,
  answer: null,
  fly: false,
};

export function requestUrl(s: AreaState): string | null {
  if (!s.point) return null;
  const [lon, lat] = s.point;
  return areaUrl({ lat, lon, from: s.range.from, to: s.range.to, intent: s.intent, eventsLimit: s.eventsLimit, othersLimit: s.othersLimit });
}

const paramsOf = (url: string) => new URLSearchParams(url.slice(url.indexOf("?") + 1));
const placeOf = (q: URLSearchParams) => `${q.get("lat")} ${q.get("lon")}`;
const baseOf = (q: URLSearchParams) => `${placeOf(q)} ${q.get("from")} ${q.get("to")}`;

/** The answer describes the same point, whatever its years. */
function answerIsHere(s: AreaState): boolean {
  const url = requestUrl(s);
  return url !== null && s.answer !== null && placeOf(paramsOf(s.answer.url)) === placeOf(paramsOf(url));
}

/** The answer the panel may show: the same point and years. Limits and intent only refine it, so "show more" keeps the list up. */
export function shownAnswer(s: AreaState): AreaState["answer"] {
  const url = requestUrl(s);
  if (url === null || s.answer === null) return null;
  return baseOf(paramsOf(s.answer.url)) === baseOf(paramsOf(url)) ? s.answer : null;
}

export type MapOutline = Pick<Selection, "fill" | "lines" | "bounds"> & { fly: boolean; key: string };

/**
 * What the map draws. Unlike the panel it holds on to the last answer for this point while a dragged range
 * loads, so the outline does not blink on every step. The key names the point and years, not the limits.
 */
export function outlineOf(s: AreaState): MapOutline | null {
  if (!answerIsHere(s)) return null;
  const body = s.answer?.body;
  if (!body || body.selection.kind === "none") return null;
  const { fill, lines, bounds } = body.selection;
  return { fill, lines, bounds, fly: s.fly, key: `${s.point} ${body.from} ${body.to}` };
}

export function areaReducer(s: AreaState, a: AreaAction): AreaState {
  switch (a.type) {
    case "click":
      return { ...s, point: a.point, intent: "click", eventsLimit: EVENTS_STEP, othersLimit: OTHERS_STEP, fly: true };
    case "choose":
      return { ...s, point: a.point, range: a.range, intent: "range", eventsLimit: EVENTS_STEP, othersLimit: OTHERS_STEP, fly: true };
    case "drag":
      // A camera still owed to this point stays owed: the drag may have beaten the click's first answer.
      return { ...s, range: a.range, intent: "range", fly: s.fly && !(answerIsHere(s) && s.answer?.body) };
    case "more":
      return a.list === "events" ? { ...s, eventsLimit: a.next } : { ...s, othersLimit: a.next };
    case "close":
      return { ...s, point: null, answer: null };
    case "answered": {
      if (a.url !== requestUrl(s)) return s;
      if (a.body?.selection.kind === "none") return { ...s, point: null, answer: null };
      if (a.body && (a.body.from !== s.range.from || a.body.to !== s.range.to)) {
        // A click opened a story and moved the range. Filed under the new question, so nothing is fetched again.
        const moved: AreaState = { ...s, range: { from: a.body.from, to: a.body.to }, intent: "range" };
        return { ...moved, answer: { url: requestUrl(moved)!, body: a.body } };
      }
      return { ...s, answer: { url: a.url, body: a.body } };
    }
  }
}
