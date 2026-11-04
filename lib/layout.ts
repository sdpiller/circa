/**
 * The two layouts, in numbers the camera needs. Each constant has a twin in app/ui/globe.module.css; keep them equal.
 * Wide: the reading column on the right, the dates along the bottom. Narrow (a phone held upright): the reading
 * column is a bottom sheet that opens at half height, with the dates inside it (decisions.md entry 36).
 */
import { RANGE_H, type Insets } from "./camera.ts";

/** Widest window that gets the narrow layout. The same value as the max-width media queries in globe.module.css. */
export const NARROW_MAX = 699;
export const NARROW_QUERY = `(max-width: ${NARROW_MAX}px)`;

/** Room at the top of a narrow window for the masthead, which the sheet never covers. The same as --masthead-h. */
export const MASTHEAD_H = 48;

/** Share of a narrow window's height a half-open sheet takes. The same as the 50dvh in .panel's half state. */
export const SHEET_HALF = 0.5;

/** The reading column's width in the wide layout: --panel-width, clamp(320px, 36vw, 420px). */
export function panelWidth(windowWidth: number): number {
  return Math.min(420, Math.max(320, windowWidth * 0.36));
}

/** What the open panel covers, for framing an outline in the rest of the map. */
export function insetsFor(narrow: boolean, width: number, height: number): Insets {
  return narrow
    ? { top: MASTHEAD_H, right: 0, bottom: Math.round(height * SHEET_HALF) }
    : { top: 0, right: panelWidth(width), bottom: RANGE_H };
}
