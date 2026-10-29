/**
 * Events in a viewport and year range, for the globe's dots (GET /api/events).
 *
 * Level of detail (decisions.md entries 3 and 25): each kind gets its own quota and its own
 * ranking by sitelinks. One mixed ranking would be all birthplaces, since births have about
 * 9 times the median sitelinks of events.
 */
import type Database from "better-sqlite3";
import { z } from "zod";
import { isQueryableYear, MAX_YEAR, MIN_YEAR } from "../time/index.ts";
import { KINDS, type EventRow } from "./schema.ts";

type Kind = (typeof KINDS)[number];

/**
 * Total dots per request by MapLibre zoom. A band applies from its minZoom up to the next band.
 * Starting guesses from PLAN.md; tune by eye in Phase 3.
 */
export const ZOOM_BANDS = [
  { minZoom: 0, total: 150 }, // whole globe
  { minZoom: 3, total: 250 }, // continent
  { minZoom: 5, total: 400 }, // country
  { minZoom: 8, total: 600 }, // city
] as const;

/**
 * Share of each band's total per kind, in percent. Events are the product, so they get the
 * largest share. Births are the most numerous and most linked kind, so they are held to a
 * modest share. Discoveries are few (about 3,000) and only exist from 501 CE.
 */
export const KIND_WEIGHTS: Record<Kind, number> = { event: 40, founding: 20, structure: 15, birth: 15, discovery: 10 };

/** Per-kind caps for a zoom level. Rounds by largest remainder so the caps sum to the band total. */
export function quotasForZoom(zoom: number): Record<Kind, number> {
  const band = ZOOM_BANDS.findLast((b) => zoom >= b.minZoom) ?? ZOOM_BANDS[0];
  const exact = KINDS.map((k) => ({ k, share: (band.total * KIND_WEIGHTS[k]) / 100 }));
  const quotas = Object.fromEntries(exact.map(({ k, share }) => [k, Math.floor(share)])) as Record<Kind, number>;
  let left = band.total - Object.values(quotas).reduce((a, b) => a + b, 0);
  // Stable sort: ties go to the kind listed first in KINDS.
  for (const { k } of [...exact].sort((a, b) => (b.share % 1) - (a.share % 1))) {
    if (left-- <= 0) break;
    quotas[k]++;
  }
  return quotas;
}

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180; // into [-180, 180)

/**
 * The longitude ranges a box covers, as one or two [west, east] pairs within [-180, 180].
 * Accepts a box sent with west > east (it crosses the antimeridian) and the unwrapped
 * longitudes MapLibre reports after the map has been spun past 180 (for example -200 to -160).
 */
export function lonRanges(west: number, east: number): [number, number][] {
  if (east - west >= 360) return [[-180, 180]];
  const span = (((east - west) % 360) + 360) % 360;
  const w = wrap(west);
  const e = w + span;
  return e <= 180 ? [[w, e]] : [[w, 180], [-180, e - 360]];
}

/** A required numeric query parameter. Missing or empty is an error, never a silent 0. */
const num = z.string().trim().min(1, "required").pipe(z.coerce.number());
const lat = num.pipe(z.number().min(-90).max(90));
const year = num.pipe(z.number().refine(isQueryableYear, `must be a whole year from ${MIN_YEAR} to ${MAX_YEAR}, and never 0`));

/** Query string of GET /api/events. Years use historical numbering (1 BCE = -1). */
export const EventsQuery = z
  .object({ west: num, south: lat, east: num, north: lat, from: year, to: year, zoom: num.pipe(z.number().min(0).max(24)) })
  .refine((q) => q.south <= q.north, { message: "south must not be north of north", path: ["south"] })
  .refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["from"] });
export type EventsQueryInput = z.output<typeof EventsQuery>;

/** The fields a dot needs: position, look (kind, category, hollow if inherited), and tooltip. */
export type Dot = Pick<EventRow, "qid" | "label" | "kind" | "category" | "start_year" | "end_year" | "lat" | "lon" | "loc_confidence" | "sitelinks">;

export type EventsResult = { quotas: Record<Kind, number>; events: Dot[] };

// One statement for both box shapes: a box that does not cross the antimeridian passes its single
// range twice. Overlap filter, not containment.
// INDEXED BY is deliberate (decisions.md entry 25): left to choose, SQLite sometimes takes the year
// index for births and foundings and sorts tens of thousands of rows (up to 140 ms per request).
// Forcing the covering index bounds the worst case at one full walk of it (about 40 ms).
const SQL = `
  SELECT qid, label, kind, category, start_year, end_year, lat, lon, loc_confidence, sitelinks
  FROM events INDEXED BY idx_events_kind_rank
  WHERE kind = @kind AND start_year <= @to AND end_year >= @from
    AND lat BETWEEN @south AND @north
    AND (lon BETWEEN @w1 AND @e1 OR lon BETWEEN @w2 AND @e2)
  ORDER BY sitelinks DESC
  LIMIT @limit`;

export function queryEvents(db: Database.Database, q: EventsQueryInput): EventsResult {
  const ranges = lonRanges(q.west, q.east);
  const [[w1, e1], [w2, e2]] = [ranges[0], ranges[1] ?? ranges[0]];
  const quotas = quotasForZoom(q.zoom);
  const stmt = db.prepare(SQL);
  const events: Dot[] = [];
  for (const kind of KINDS) {
    const rows = stmt.all({ kind, from: q.from, to: q.to, south: q.south, north: q.north, w1, e1, w2, e2, limit: quotas[kind] }) as Dot[];
    events.push(...rows);
  }
  return { quotas, events };
}
