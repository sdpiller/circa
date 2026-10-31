/**
 * The answer to a click or a range (GET /api/area): the outline, any story, and the items listed for it.
 * "Events" are kinds event and discovery; "others" (people and places) are birth, founding, structure.
 */
import type Database from "better-sqlite3";
import { z } from "zod";
import { citedQids, type PublishedStory } from "../narrative/publish.ts";
import { resolveOutline, type Selection } from "../outline/resolve.ts";
import { PUBLISHED, storyFor } from "../stories/catalog.ts";
import { isQueryableYear, MAX_YEAR, MIN_YEAR } from "../time/index.ts";
import { provinceAt } from "./provinces.ts";
import type { EventRow } from "./schema.ts";

const num = z.string().trim().min(1, "required").pipe(z.coerce.number());
export const year = num.pipe(z.number().refine(isQueryableYear, `must be a whole year from ${MIN_YEAR} to ${MAX_YEAR}, and never 0`));
const limit = z.string().trim().min(1).pipe(z.coerce.number()).pipe(z.number().int().min(1).max(200));

/** Query string of GET /api/area. Years use historical numbering (1 BCE = -1). */
export const AreaQuery = z
  .object({
    lat: num.pipe(z.number().min(-90).max(90)),
    lon: num.pipe(z.number().min(-180).max(180)),
    from: year,
    to: year,
    intent: z.enum(["click", "range"]),
    eventsLimit: limit.default(25),
    othersLimit: limit.default(30),
  })
  .refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["from"] });
export type AreaQueryInput = z.output<typeof AreaQuery>;

export type AreaItem = Pick<
  EventRow,
  "qid" | "label" | "description" | "kind" | "category" | "start_year" | "end_year" | "loc_confidence" | "wikipedia_title" | "sitelinks"
>;

export type AreaAnswer = {
  selection: Selection | { kind: "none" };
  storyId: string | null;
  from: number;
  to: number;
  events: AreaItem[];
  eventsTotal: number;
  others: AreaItem[];
  othersTotal: number;
};

const COLUMNS = "qid, label, description, kind, category, start_year, end_year, loc_confidence, wikipedia_title, sitelinks";
const WHERE = "province_id IN (SELECT value FROM json_each(@ids)) AND start_year <= @to AND end_year >= @from";
const KINDS = { events: "kind IN ('event', 'discovery')", others: "kind NOT IN ('event', 'discovery')" };
type Group = keyof typeof KINDS;

type Statements = { list: Database.Statement; count: Database.Statement; cited: Database.Statement };
const statements = new WeakMap<Database.Database, Record<Group, Statements>>();

function statementsFor(db: Database.Database, group: Group): Statements {
  let perDb = statements.get(db);
  if (!perDb) {
    const make = (g: Group): Statements => ({
      list: db.prepare(`SELECT ${COLUMNS} FROM events WHERE rowid IN (SELECT rowid FROM events WHERE ${WHERE} AND ${KINDS[g]} ORDER BY sitelinks DESC, qid LIMIT @limit)`),
      count: db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${WHERE} AND ${KINDS[g]}`),
      cited: db.prepare(`SELECT ${COLUMNS} FROM events WHERE ${WHERE} AND ${KINDS[g]} AND qid IN (SELECT value FROM json_each(@qids))`),
    });
    statements.set(db, (perDb = { events: make("events"), others: make("others") }));
  }
  return perDb[group];
}

/** The top items of a group and the full count, with any cited item outside the top appended. */
function section(db: Database.Database, group: Group, p: { ids: string; from: number; to: number }, max: number, cited: string[]) {
  const s = statementsFor(db, group);
  const items = s.list.all({ ...p, limit: max }) as AreaItem[];
  const total = (s.count.get(p) as { n: number }).n;
  if (cited.length > 0) {
    const shown = new Set(items.map((i) => i.qid));
    for (const item of s.cited.all({ ...p, qids: JSON.stringify(cited) }) as AreaItem[]) if (!shown.has(item.qid)) items.push(item);
  }
  return { items, total };
}

/** Ties in sitelinks go by qid, compared like SQLite's default BINARY collation, so the order is stable. */
const byQid = (a: AreaItem, b: AreaItem) => (a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0);

export function queryArea(db: Database.Database, q: AreaQueryInput, stories: readonly PublishedStory[] = PUBLISHED): AreaAnswer {
  const clicked = provinceAt(db, q.lon, q.lat);
  if (!clicked) return { selection: { kind: "none" }, storyId: null, from: q.from, to: q.to, events: [], eventsTotal: 0, others: [], othersTotal: 0 };

  const story = storyFor(clicked.id, q.from, q.to, q.intent, stories);
  const from = story ? story.entry.from : q.from;
  const to = story ? story.entry.to : q.to;
  const selection = resolveOutline(db, { lon: q.lon, lat: q.lat, from, to, clicked, story });

  const p = { ids: JSON.stringify(selection.provinceIds), from, to };
  const cited = story ? citedQids(story) : [];
  const ev = section(db, "events", p, q.eventsLimit, cited);
  const ot = section(db, "others", p, q.othersLimit, cited);
  ev.items.sort((a, b) => a.start_year - b.start_year || b.sitelinks - a.sitelinks || byQid(a, b));
  ot.items.sort((a, b) => b.sitelinks - a.sitelinks || byQid(a, b));
  return { selection, storyId: story?.entry.id ?? null, from, to, events: ev.items, eventsTotal: ev.total, others: ot.items, othersTotal: ot.total };
}
