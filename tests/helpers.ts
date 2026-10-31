import Database from "better-sqlite3";
import { loadGeo } from "../etl/load.ts";
import type { NewRegion, ProvinceRow } from "../etl/boundaries-parse.ts";
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
