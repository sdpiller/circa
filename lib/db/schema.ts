/**
 * SQLite schema for Chronoglobe, and the zod schema every events row must pass before insert.
 * Based on the schema in CLAUDE.md, with additions logged in docs/decisions.md (entry 23).
 */
import { join } from "node:path";
import { z } from "zod";

/** npm scripts and Next.js both run from the repo root. */
export const DB_PATH = join(process.cwd(), "data", "chronoglobe.db");

export const SCHEMA_SQL = `
CREATE TABLE events (
  qid TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  label_lang TEXT NOT NULL,        -- 'en', 'mul', or another language code
  description TEXT,
  kind TEXT NOT NULL,              -- event | founding | structure | birth | discovery
  category TEXT NOT NULL,
  class_key TEXT NOT NULL,         -- which class in etl/classes.json the item came from
  start_year INTEGER NOT NULL,     -- effective interval start (historical numbering, no year 0)
  end_year INTEGER NOT NULL,       -- effective interval end
  orig_year INTEGER,               -- as stated in Wikidata
  year_precision INTEGER,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  loc_confidence TEXT NOT NULL,    -- exact | inherited
  loc_source TEXT,                 -- P625 | P276 | P131 | P19 | P189
  sitelinks INTEGER NOT NULL,      -- notability proxy
  wikipedia_title TEXT
);
CREATE INDEX idx_events_years ON events(start_year, end_year);
CREATE INDEX idx_events_geo ON events(lat, lon);
-- Covering index for "top N of one kind in a viewport and range" (decisions.md entry 25).
-- Walks a kind in sitelinks order and filters years and bbox without touching the table.
CREATE INDEX idx_events_kind_rank ON events(kind, sitelinks DESC, start_year, end_year, lat, lon);

CREATE TABLE narratives (
  cache_key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  event_ids TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE build_info (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const KINDS = ["event", "founding", "structure", "birth", "discovery"] as const;
export const CATEGORIES = ["conflict", "disaster", "politics", "founding", "culture", "science", "other"] as const;

const year = z.number().int().refine((y) => y !== 0, "year 0 does not exist");

export const EventRow = z
  .object({
    qid: z.string().regex(/^Q\d+$/),
    label: z.string().min(1),
    label_lang: z.string().min(1),
    description: z.string().nullable(),
    kind: z.enum(KINDS),
    category: z.enum(CATEGORIES),
    class_key: z.string().min(1),
    start_year: year,
    end_year: year,
    orig_year: year.nullable(),
    year_precision: z.number().int().min(0).max(14).nullable(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    loc_confidence: z.enum(["exact", "inherited"]),
    loc_source: z.enum(["P625", "P276", "P131", "P19", "P189"]).nullable(),
    sitelinks: z.number().int().min(0),
    wikipedia_title: z.string().min(1).nullable(),
  })
  .refine((r) => r.start_year <= r.end_year, "start_year must not be after end_year");
export type EventRow = z.infer<typeof EventRow>;
