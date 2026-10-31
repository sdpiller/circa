# Chronoglobe

A 3D globe of human history. The user spins and zooms the globe, picks a year range (roughly 3500 BCE to present), and explores. The globe starts blank: no grid, no dots. Clicking anywhere reveals an outline of the region that mattered in the chosen years, and a reading column opens with the events, people and places inside that outline. For twenty featured places and eras, the column also opens with a short story written offline by Claude and grounded ONLY in the items it cites. The story quality is the product; the globe is the vehicle. Do not compete on historical borders: outlines are approximate and built from modern provinces, and the UI says so.

This is a for-fun solo project built with Claude Code. Prefer simple, boring, working solutions. Do not over-engineer.

**Read `docs/PLAN.md` before starting any phase.** It has the origin, phase-by-phase plan with acceptance criteria, backlog, and unverified assumptions. This file holds the standing rules.

## Current status

Phase 5 complete and approved by the owner (2026-10-30): twenty featured stories, written offline and checked mechanically (decisions.md entries 30 and 31). Phase 6 is in design on branch phase-6-polish; nothing is built yet. (Update this line at every phase gate.)

## Working style (how to collaborate with the owner)

The owner wants a rigorous, honest mentor, not an agreeable assistant.
- Do not default to agreement. Identify weaknesses, blind spots, and flawed assumptions, including in these docs.
- When you critique something, explain why and propose a better, simpler, or more elegant alternative.
- If a better approach than what is written here exists, say so BEFORE implementing the worse one.
- Be direct and clear. Prioritize helping the owner improve over being agreeable.
- Style rule: never use em dashes in any prose, docs, comments, commit messages, or UI copy. Use commas, colons, or periods.
- Work in phases, stop at each gate, and report results honestly, including failures and uncertainty.

## Key design decisions and rationale (seed for docs/decisions.md)

1. **Preload data into our own database; no live Wikidata queries per interaction.** A globe with a scrubbing slider fires queries constantly, and the public Wikidata query service is slow and times out. (An earlier idea of fanning out to live APIs per request was rejected for this reason.)
2. **Rank by Wikidata sitelink count** (number of Wikipedia language editions) as a cheap notability score. It decides which dots appear at world scale and which events feed each story.
3. **Superseded (decisions.md entry 32): no viewport queries.** The globe draws nothing until a click. A click selects a historical region (or the modern country) from Cliopatria and historical-basemaps, built from Natural Earth provinces and capped at 800 km from the click. Events are listed by the provinces in that outline plus year overlap, top N by sitelinks. The original reason still holds: "near the click" has no fixed meaning on a globe, so a region, not a radius, defines the area.
4. **LLM last, and constrained.** Claude only summarizes retrieved events and cites them by id. It must never answer from memory. An invented battle destroys trust in a history app. Since Phase 5 this applies to offline writing: stories are written in Claude Code sessions, checked by `lib/narrative`, and committed.
5. **Do not do our own ML or change detection.** That is Picterra's moat and a rabbit hole. Use precomputed data if physical-record features are ever added (see Backlog in `docs/PLAN.md`).
6. **Globe renderer: MapLibre GL JS with globe projection** (continuous zoom from orbit to street, real tile basemaps). globe.gl is prettier from orbit but weak up close; Cesium is heavier than needed unless 3D terrain is wanted.
7. **Superseded (decisions.md entry 30): no runtime generation and no narrative cache.** Stories are committed files, so there is no API spend, no rate limit, and nothing to key.

## Non-goals (do not build unless the owner asks)

Accounts, editing or crowdsourcing, authoritative historical borders (the era outlines of Phase 6 are approximate and say so; never present them as maps of record, and do not hand-draw or hand-edit them), a play button or time sweep, a density heat layer, more than twenty stories, real-time data, mobile app, 3D terrain, satellite change detection, multi-language UI.

## Known risks and required responses

- **Wikidata coverage bias.** The Mediterranean, Europe, and East Asia will be dense; pre-colonial Americas and much of Africa will look sparse. This reflects documentation, not history. Do not hide it: show a caption ("documented history is not the same as history; coverage is uneven worldwide").
- **Emptiness.** The globe is blank until a click, and a selected area with no documented items shows its outline and says "Nothing documented here for these years." Open water more than 50 km from any province selects nothing. Always show the scale of the outline (area in km2, approximate or modern borders, and the 800 km cap when it cut the region). Never pad. (The widening fallback ladder was retired on 2026-10-29, decisions.md entry 28: widening would describe an area the user did not select.)
- **Fuzzy dates.** Many items are precise only to a decade or century, and BCE has a year-zero trap. See conventions.
- **Imprecise locations.** Many events have no coordinates. See location confidence.
- **Historical outlines are not maps of record.** They come from two open datasets, shapes can jump when the slider crosses between datasets or snapshots, and some atlas labels are broad ("Semites", "Bantu"). The panel says "approximate, built from modern provinces" and shows the atlas line for atlas names. Keep both.
- **Hallucinated stories.** Mitigated by writing rules (`stories/RULES.md`), a per-sentence mechanical checker that runs in `npm test`, a fresh reviewer per story, and the owner's read at the gate (design: `docs/superpowers/specs/2026-10-29-featured-stories-design.md`). This is mandatory, not optional.
- **Scope creep.** Do the phases in order. Do not add Backlog features early.

## Stack (verify current versions and APIs from official docs; do not rely on memory)

- Next.js (App Router) + TypeScript, strict mode
- MapLibre GL JS with globe projection (check current docs for how to enable it). Pinned at 6.16.0: `lib/camera.ts` copies its globe radius relation and `tests/camera.test.ts` fails on any other version. After an upgrade, re-measure `frameOutline` before changing the pin.
- No geometry library: point in polygon, distance, area and edge cancelling are short pure functions in `lib/geo`. Ask before adding one.
- SQLite via better-sqlite3
- zod for validating external data and request params
- vitest for tests

Ask before adding any dependency not listed here. If you believe Python is better for the ETL step, propose it with reasons and wait for approval.

### Environment variables (.env.local, never committed; keep .env.example current)
- `WIKIMEDIA_CONTACT` (email or URL for the User-Agent on Wikimedia requests, required by their policy)
- `BASEMAP_STYLE_URL` (optional; a provider with a free tier; do NOT hammer the public OpenStreetMap tile servers). Unset means OpenFreeMap positron, recoloured to cream in the browser.

## Repo layout

```
/app                 Next.js routes and UI
/app/ui              GlobeApp, GlobeMap, AreaPanel, RangeControl, StoriesList, Story
/app/api/area        GET a click (lat, lon, from, to, intent): outline, story, event lists
/app/api/summary     GET a Wikipedia extract for an item, cached in data/cache.db
/lib/db              SQLite access, queries (area, provinces, regions)
/lib/geo             point in polygon, distance, area, merging provinces into an outline
/lib/outline         which region a click gets (choose), scale line, resolve
/lib/camera.ts       frameOutline: zoom and centre for an outline
/lib/labels.ts       map names by apparent zoom
/lib/selection.ts    client selection state and the area URL
/lib/stories         story catalog and storyFor
/lib/time            year conventions, range helpers
/lib/narrative       story checker, publish, staleness
/stories            featured stories, frozen inputs, RULES.md, published.json
/etl                 scripts: fetch, boundaries, load, publish, check, bench
/etl/classes.json    category -> root class config
/etl/struck-names.json  atlas names the owner struck (honoured by etl:load)
/data                local SQLite file and raw downloads (gitignored)
/docs                PLAN.md, data-audit.md, decisions.md, region-names.md
/tests               unit tests and fixtures
```

## Core conventions (decide once, never change casually)

### Year convention
- Store years as signed integers in historical convention: 1 BCE = -1, 1 CE = 1. There is NO year 0 in our storage.
- Wikidata and ISO 8601 treat year zero differently from everyday BCE usage. Write a conversion function in `/lib/time` and unit-test it against known events: Battle of Marathon (490 BCE), Battle of Salamis (480 BCE), eruption of Vesuvius (79 CE), fall of Constantinople (1453 CE). Record findings in `docs/decisions.md`.
- Year granularity only. Ignore Julian vs Gregorian differences.

### Imprecise dates
Wikidata time values carry a precision code (9 = year, 8 = decade, 7 = century, 6 = millennium). Store the original year and precision, plus an EFFECTIVE interval (for a century-precision date, the whole century). Range filtering uses OVERLAP, not containment:

`event.start_year <= range.to AND event.end_year >= range.from`

### Location confidence
- `exact`: the item has its own coordinates (P625).
- `inherited`: coordinates from its location (P276), then its administrative entity (P131).
- Never inherit from country (P17). A country centroid is misleading on a globe. Skip those events in v1.
- The UI must show inherited locations differently. Events are no longer drawn on the globe, so the "approximate location" mark in the panel is what remains of the old hollow dots.

### Categories
conflict | disaster | politics | founding | culture | science | other. Mapping from Wikidata classes lives in `/etl/classes.json`.

### Schema (as built, abridged; adjust if justified and log the change)

```sql
CREATE TABLE events (
  qid TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  start_year INTEGER NOT NULL,  -- effective interval start
  end_year INTEGER NOT NULL,    -- effective interval end
  orig_year INTEGER,            -- as stated in Wikidata
  year_precision INTEGER,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  loc_confidence TEXT NOT NULL, -- exact | inherited
  loc_source TEXT,              -- P625 | P276 | P131 (later phases add P19, P189)
  sitelinks INTEGER NOT NULL,   -- notability proxy
  wikipedia_title TEXT,
  province_id TEXT              -- Natural Earth adm1_code, or the nearest within 150 km
  -- also label_lang, kind, class_key: see lib/db/schema.ts
);
CREATE INDEX idx_events_years ON events(start_year, end_year);
CREATE INDEX idx_events_geo ON events(lat, lon);
CREATE INDEX idx_events_province ON events(province_id, kind, start_year, end_year, sitelinks, qid);

CREATE TABLE provinces (id TEXT PRIMARY KEY, name, country, lon, lat, west, south, east, north, area, geojson);
CREATE TABLE regions (id INTEGER PRIMARY KEY, source, name, from_year, to_year, area, wikidata,
                      west, south, east, north, geojson);  -- source: cliopatria | basemaps
CREATE INDEX idx_regions_years ON regions(from_year, to_year);
```

`lib/db/schema.ts` is the source of truth. Region geometry is simplified at 0.02 degrees and coordinates are rounded to 3 decimals at load (decisions.md entry 32). Measure before adding an R*Tree.

### Licensing and attribution
Wikidata data is CC0. Wikipedia text is CC BY-SA, so attribute and link to the source page wherever extracts or stories derived from them are shown. Credit the basemap provider. Also credit, in the UI and README: Cliopatria (CC BY 4.0, link to the license, note that shapes are processed), historical-basemaps (GPL-3.0), and Natural Earth (public domain). GPL-3.0: once the app is public, the processed outline data derived from historical-basemaps must be available under GPL-3.0 with credit; Phase 7 must plan for it (not legal advice). Put attributions in the UI footer and README.

## Working agreements

- One phase at a time. At the end of each phase: summarize what was done, show acceptance results, then STOP for the owner's go-ahead.
- Small, focused commits. Run tests and typecheck before each commit.
- Never hardcode Wikidata QIDs from memory. Resolve by label lookup, verify against the live endpoint, and record them with labels in `/etl/classes.json`.
- When an external API returns an unexpected shape, save a fixture in `/tests/fixtures` and write a test.
- Record non-obvious decisions in `docs/decisions.md`, starting with the seven above.
- A twenty-first story needs a new input generator built around provinces: `etl/story-input.ts` was removed with the grid (decisions.md entry 32).
- No secrets in the repo. Respect every site's usage policy; no abusive scraping.
- If requirements are ambiguous or a phase gate fails, ask instead of guessing.
