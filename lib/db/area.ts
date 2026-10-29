/**
 * The contents of one grid cell for a year range, for the area box (GET /api/area).
 * "Events" are kinds event and discovery; "others" (people and places) are birth, founding, structure.
 */
import type Database from "better-sqlite3";
import { getResolution } from "h3-js";
import { z } from "zod";
import { cellAcrossKm, isGridCell, type Res } from "../cells.ts";
import { year } from "./events.ts";
import type { EventRow } from "./schema.ts";

const limit = z.string().trim().min(1).pipe(z.coerce.number()).pipe(z.number().int().min(1).max(200));

/** Query string of GET /api/area. Years use historical numbering (1 BCE = -1). */
export const AreaQuery = z
  .object({
    cell: z.string().refine(isGridCell, "must be an H3 cell at resolution 2 to 5"),
    from: year,
    to: year,
    eventsLimit: limit.default(25),
    othersLimit: limit.default(30),
    focus: z.string().regex(/^Q\d+$/).optional(),
  })
  .refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["from"] });
export type AreaQueryInput = z.output<typeof AreaQuery>;

export type AreaItem = Pick<
  EventRow,
  "qid" | "label" | "description" | "kind" | "category" | "start_year" | "end_year" | "loc_confidence" | "wikipedia_title" | "sitelinks"
>;
export type AreaResult = {
  cell: string;
  res: Res;
  acrossKm: number;
  events: AreaItem[];
  eventsTotal: number;
  others: AreaItem[];
  othersTotal: number;
};

const COLUMNS = "qid, label, description, kind, category, start_year, end_year, loc_confidence, wikipedia_title, sitelinks";
const EVENT_KINDS = "kind IN ('event', 'discovery')";
const OTHER_KINDS = "kind NOT IN ('event', 'discovery')";

type Statements = { list: Database.Statement; count: Database.Statement; one: Database.Statement };
const statements = new WeakMap<Database.Database, Map<string, Statements>>();

// The column name comes from getResolution of a validated grid cell (2 to 5), never from raw input.
function statementsFor(db: Database.Database, res: Res, group: "events" | "others"): Statements {
  let perDb = statements.get(db);
  if (!perDb) statements.set(db, (perDb = new Map()));
  const key = `${res}:${group}`;
  let s = perDb.get(key);
  if (!s) {
    const where = `h3_r${res} = @cell AND start_year <= @to AND end_year >= @from`;
    const kinds = group === "events" ? EVENT_KINDS : OTHER_KINDS;
    s = {
      list: db.prepare(`SELECT ${COLUMNS} FROM events WHERE ${where} AND ${kinds} ORDER BY sitelinks DESC LIMIT @limit`),
      count: db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${where} AND ${kinds}`),
      one: db.prepare(`SELECT ${COLUMNS} FROM events WHERE ${where} AND ${kinds} AND qid = @qid`),
    };
    perDb.set(key, s);
  }
  return s;
}

function section(db: Database.Database, res: Res, group: "events" | "others", p: { cell: string; from: number; to: number }, max: number, focus?: string) {
  const s = statementsFor(db, res, group);
  const items = s.list.all({ ...p, limit: max }) as AreaItem[];
  const total = (s.count.get(p) as { n: number }).n;
  if (focus && !items.some((i) => i.qid === focus)) {
    const extra = s.one.get({ ...p, qid: focus }) as AreaItem | undefined;
    if (extra) items.push(extra);
  }
  return { items, total };
}

export function queryArea(db: Database.Database, q: AreaQueryInput): AreaResult {
  const res = getResolution(q.cell) as Res;
  const p = { cell: q.cell, from: q.from, to: q.to };
  const ev = section(db, res, "events", p, q.eventsLimit, q.focus);
  const ot = section(db, res, "others", p, q.othersLimit, q.focus);
  ev.items.sort((a, b) => a.start_year - b.start_year || b.sitelinks - a.sitelinks);
  ot.items.sort((a, b) => b.sitelinks - a.sitelinks);
  return { cell: q.cell, res, acrossKm: cellAcrossKm(res), events: ev.items, eventsTotal: ev.total, others: ot.items, othersTotal: ot.total };
}
