import Database from "better-sqlite3";
import { loadGeo } from "../etl/load.ts";
import type { NewRegion } from "../etl/boundaries-parse.ts";
import { bboxOf, type AreaGeometry } from "../lib/geo/geometry.ts";
import type { ProvinceRow } from "../lib/geo/provinces.ts";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { SCHEMA_SQL, type EventRow } from "../lib/db/schema.ts";

let n = 0;
export const resetRowCounter = () => {
  n = 0;
};

export const row = (over: Partial<EventRow> = {}): EventRow => ({
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

export function makeDb(rows: EventRow[]): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  const insert = db.prepare(`INSERT INTO events (qid, label, label_lang, description, kind, category, class_key,
    start_year, end_year, orig_year, year_precision, lat, lon, loc_confidence, loc_source, sitelinks, wikipedia_title)
    VALUES (@qid, @label, @label_lang, @description, @kind, @category, @class_key,
    @start_year, @end_year, @orig_year, @year_precision, @lat, @lon, @loc_confidence, @loc_source, @sitelinks, @wikipedia_title)`);
  for (const r of rows) insert.run(r);
  db.exec("ANALYZE");
  return db;
}

/** An in-memory database with events, provinces and regions; events get their province as the loader does. */
export function makeGeoDb(rows: EventRow[], provinces: ProvinceRow[], regions: NewRegion[]): Database.Database {
  const db = makeDb(rows);
  loadGeo(db, { provinces, regions });
  return db;
}

/** A closed box, west to east and south to north, in degrees. */
export const box = (west: number, south: number, east: number, north: number): AreaGeometry => ({
  type: "Polygon",
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

/** A province that is one box, with its representative point at the centre unless given. */
export function province(id: string, geometry: AreaGeometry, over: Partial<ProvinceRow> = {}): ProvinceRow {
  const [west, south, east, north] = bboxOf(geometry);
  return { id, name: id, country: "Testland", lon: (west + east) / 2, lat: (south + north) / 2, west, south, east, north, area: 10000, geojson: JSON.stringify(geometry), ...over };
}

/** A row of the regions table. */
export function region(source: NewRegion["source"], name: string, from_year: number, to_year: number, geometry: AreaGeometry, area = 1000): NewRegion {
  const [west, south, east, north] = bboxOf(geometry);
  return { source, name, from_year, to_year, area, wikidata: null, west, south, east, north, geojson: JSON.stringify(geometry) };
}

/** A story with one sentence citing the given qids. */
export function story(id: string, provinces: string[], from: number, to: number, qids: string[] = []): PublishedStory {
  return {
    entry: { id, place: "Somewhere", from, to },
    point: [0, 0],
    provinces,
    writtenAt: "2026-10-29",
    writtenBy: "test",
    paragraphs: [[{ text: "Text.", cites: qids.map((qid, i) => ({ ref: `E${i + 1}`, qid, label: "L" })) }]],
  };
}
