import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { EventsQuery, KIND_WEIGHTS, lonRanges, queryEvents, quotasForZoom, ZOOM_BANDS, type EventsQueryInput } from "../lib/db/events.ts";
import { KINDS, SCHEMA_SQL, type EventRow } from "../lib/db/schema.ts";
import { effectiveInterval, PRECISION } from "../lib/time/index.ts";

let n = 0;
const row = (over: Partial<EventRow>): EventRow => ({
  qid: `Q${++n}`,
  label: "Test",
  label_lang: "en",
  description: null,
  kind: "event",
  category: "conflict",
  class_key: "battle",
  start_year: -490,
  end_year: -490,
  orig_year: -490,
  year_precision: 9,
  lat: 38,
  lon: 23,
  loc_confidence: "exact",
  loc_source: "P625",
  sitelinks: 3,
  wikipedia_title: null,
  ...over,
});

function makeDb(rows: EventRow[]): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  const insert = db.prepare(`INSERT INTO events VALUES (@qid, @label, @label_lang, @description, @kind, @category, @class_key,
    @start_year, @end_year, @orig_year, @year_precision, @lat, @lon, @loc_confidence, @loc_source, @sitelinks, @wikipedia_title)`);
  for (const r of rows) insert.run(r);
  db.exec("ANALYZE");
  return db;
}

const world = { west: -180, south: -90, east: 180, north: 90, from: -3500, to: 2026, zoom: 0 };

describe("lonRanges", () => {
  it("passes an ordinary box through", () => {
    expect(lonRanges(10, 20)).toEqual([[10, 20]]);
  });

  it("splits a box sent with west > east at the antimeridian", () => {
    expect(lonRanges(170, -170)).toEqual([[170, 180], [-180, -170]]);
  });

  it("wraps unwrapped longitudes, as MapLibre reports after spinning past 180", () => {
    expect(lonRanges(-200, -160)).toEqual([[160, 180], [-180, -160]]);
    expect(lonRanges(190, 200)).toEqual([[-170, -160]]);
  });

  it("keeps a box that ends exactly at the antimeridian in one piece", () => {
    expect(lonRanges(-190, -180)).toEqual([[170, 180]]);
  });

  it("treats a span of 360 degrees or more as the whole globe", () => {
    expect(lonRanges(-180, 180)).toEqual([[-180, 180]]);
    expect(lonRanges(-300, 300)).toEqual([[-180, 180]]);
  });
});

describe("quotasForZoom", () => {
  it("splits each band's total across kinds exactly", () => {
    for (const band of ZOOM_BANDS) {
      const q = quotasForZoom(band.minZoom);
      expect(Object.values(q).reduce((a, b) => a + b, 0)).toBe(band.total);
    }
  });

  it("gives every kind a share, with events the largest", () => {
    const q = quotasForZoom(0);
    for (const k of KINDS) expect(q[k]).toBeGreaterThan(0);
    expect(Math.max(...Object.values(q))).toBe(q.event);
  });

  it("picks the band by fractional zoom", () => {
    expect(quotasForZoom(2.99)).toEqual(quotasForZoom(0));
    expect(quotasForZoom(3)).toEqual(quotasForZoom(4.5));
    expect(quotasForZoom(22)).toEqual(quotasForZoom(ZOOM_BANDS.at(-1)!.minZoom));
  });

  it("has weights for every kind that sum to 100", () => {
    expect(Object.keys(KIND_WEIGHTS).sort()).toEqual([...KINDS].sort());
    expect(Object.values(KIND_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("EventsQuery", () => {
  const params = (over: Record<string, string | undefined> = {}) =>
    Object.fromEntries(Object.entries({ west: "-10", south: "35", east: "30", north: "60", from: "-500", to: "-300", zoom: "4.2", ...over }).filter(([, v]) => v !== undefined));

  it("parses a valid query string into numbers", () => {
    expect(EventsQuery.parse(params())).toEqual({ west: -10, south: 35, east: 30, north: 60, from: -500, to: -300, zoom: 4.2 });
  });

  it("rejects year 0, which does not exist", () => {
    expect(EventsQuery.safeParse(params({ from: "0" })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ to: "0" })).success).toBe(false);
  });

  it("rejects fractional years and years outside the data window", () => {
    expect(EventsQuery.safeParse(params({ from: "-500.5" })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ from: "-3501" })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ to: "2027" })).success).toBe(false);
  });

  it("rejects a range that runs backwards", () => {
    expect(EventsQuery.safeParse(params({ from: "-300", to: "-500" })).success).toBe(false);
  });

  it("rejects missing, empty, and non-numeric parameters instead of reading them as 0", () => {
    expect(EventsQuery.safeParse(params({ west: undefined })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ west: "" })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ west: "abc" })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ west: "Infinity" })).success).toBe(false);
  });

  it("rejects latitudes out of range and south north of north", () => {
    expect(EventsQuery.safeParse(params({ north: "91" })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ south: "61" })).success).toBe(false);
  });

  it("rejects zoom outside MapLibre's range", () => {
    expect(EventsQuery.safeParse(params({ zoom: "-1" })).success).toBe(false);
    expect(EventsQuery.safeParse(params({ zoom: "25" })).success).toBe(false);
  });
});

describe("queryEvents", () => {
  beforeEach(() => {
    n = 0;
  });

  it("finds events on both sides of the antimeridian and nothing in between", () => {
    const db = makeDb([
      row({ qid: "Q1", lat: -17, lon: 178.5 }), // Fiji, west of the line
      row({ qid: "Q2", lat: -14, lon: -171.8 }), // Samoa, east of the line
      row({ qid: "Q3", lat: -17, lon: 0 }), // far away
    ]);
    const q: EventsQueryInput = { ...world, west: 170, east: -170, south: -25, north: -10, zoom: 5 };
    expect(queryEvents(db, q).events.map((e) => e.qid).sort()).toEqual(["Q1", "Q2"]);
    // The same box as MapLibre reports it after spinning west past 180.
    expect(queryEvents(db, { ...q, west: -190, east: -170 }).events.map((e) => e.qid).sort()).toEqual(["Q1", "Q2"]);
  });

  it("filters by overlap, so a century-precision event matches any range touching its century", () => {
    const c5bce = effectiveInterval(-450, PRECISION.century); // 5th century BCE: -500 to -401
    expect(c5bce).toEqual({ start: -500, end: -401 });
    const db = makeDb([
      row({ qid: "Q10", start_year: c5bce.start, end_year: c5bce.end, orig_year: -450, year_precision: PRECISION.century }),
      row({ qid: "Q11", start_year: -490, end_year: -490 }), // Marathon, exact year
    ]);
    const ids = (from: number, to: number) => queryEvents(db, { ...world, from, to }).events.map((e) => e.qid).sort();
    expect(ids(-445, -440)).toEqual(["Q10"]); // range strictly inside the century: overlap, not containment
    expect(ids(-600, -500)).toEqual(["Q10"]); // touches the century's first year
    expect(ids(-401, -300)).toEqual(["Q10"]); // touches its last year
    expect(ids(-400, -300)).toEqual([]); // starts one year after it ends
    expect(ids(-490, -490)).toEqual(["Q10", "Q11"]);
  });

  it("ranks and caps within each kind, so famous births cannot crowd out events", () => {
    const rows = [
      ...Array.from({ length: 400 }, (_, i) => row({ kind: "birth", category: "culture", class_key: "human", sitelinks: 100 + i })),
      ...Array.from({ length: 100 }, (_, i) => row({ kind: "event", sitelinks: 1 + (i % 5) })),
    ];
    const db = makeDb(rows);
    const { quotas, events } = queryEvents(db, world);
    const births = events.filter((e) => e.kind === "birth");
    const evs = events.filter((e) => e.kind === "event");
    expect(births).toHaveLength(quotas.birth);
    expect(evs).toHaveLength(quotas.event);
    // Each kind returns its own top N by sitelinks, highest first.
    expect(births[0].sitelinks).toBe(499);
    expect(births.at(-1)!.sitelinks).toBe(500 - quotas.birth);
    expect(evs.every((e, i) => i === 0 || evs[i - 1].sitelinks >= e.sitelinks)).toBe(true);
  });

  it("returns only the fields a dot needs", () => {
    const db = makeDb([row({ qid: "Q31900", label: "Battle of Marathon", description: "battle in 490 BCE", wikipedia_title: "Battle of Marathon" })]);
    expect(queryEvents(db, world).events).toEqual([
      { qid: "Q31900", label: "Battle of Marathon", kind: "event", category: "conflict", start_year: -490, end_year: -490, lat: 38, lon: 23, loc_confidence: "exact", sitelinks: 3 },
    ]);
  });

  it("returns an empty list, not an error, for an empty viewport", () => {
    const db = makeDb([row({})]);
    expect(queryEvents(db, { ...world, west: -150, east: -140, south: -40, north: -30 }).events).toEqual([]);
  });
});
