# Chronoglobe

A 3D globe of human history. The user spins and zooms the globe, picks a year range (roughly 3500 BCE to present), and sees notable historical events as dots. Clicking an area opens a box with the events in that area and range. For about twenty featured places and eras, the box also opens with a short story written offline by Claude and grounded ONLY in the items it cites. The story quality is the product; the globe is the vehicle. Do not compete on historical borders.

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
3. **Level of detail by viewport, not fixed radius.** "Near the click" has no fixed meaning on a globe. Query by visible bounding box plus year range, show top N by notability, N grows with zoom.
4. **LLM last, and constrained.** Claude only summarizes retrieved events and cites them by id. It must never answer from memory. An invented battle destroys trust in a history app. Since Phase 5 this applies to offline writing: stories are written in Claude Code sessions, checked by `lib/narrative`, and committed.
5. **Do not do our own ML or change detection.** That is Picterra's moat and a rabbit hole. Use precomputed data if physical-record features are ever added (see Backlog in `docs/PLAN.md`).
6. **Globe renderer: MapLibre GL JS with globe projection** (continuous zoom from orbit to street, real tile basemaps). globe.gl is prettier from orbit but weak up close; Cesium is heavier than needed unless 3D terrain is wanted.
7. **Superseded (decisions.md entry 30): no runtime generation and no narrative cache.** Stories are committed files, so there is no API spend, no rate limit, and nothing to key.

## Non-goals (do not build unless the owner asks)

Accounts, editing or crowdsourcing, historical borders, real-time data, mobile app, 3D terrain, satellite change detection, multi-language UI.

## Known risks and required responses

- **Wikidata coverage bias.** The Mediterranean, Europe, and East Asia will be dense; pre-colonial Americas and much of Africa will look sparse. This reflects documentation, not history. Do not hide it: show a caption ("documented history is not the same as history; coverage is uneven worldwide").
- **Emptiness.** The grid only draws cells with documented items in the range, so empty land is visibly empty. Clicking elsewhere says so plainly. Always show the scale of the selected cell. Never pad. (The earlier widening fallback ladder was retired on 2026-10-29, decisions.md entry 28: widening would describe an area the user did not select.)
- **Fuzzy dates.** Many items are precise only to a decade or century, and BCE has a year-zero trap. See conventions.
- **Imprecise locations.** Many events have no coordinates. See location confidence.
- **Hallucinated stories.** Mitigated by writing rules (`stories/RULES.md`), a per-sentence mechanical checker that runs in `npm test`, a fresh reviewer per story, and the owner's read at the gate (design: `docs/superpowers/specs/2026-10-29-featured-stories-design.md`). This is mandatory, not optional.
- **Scope creep.** Do the phases in order. Do not add Backlog features early.

## Stack (verify current versions and APIs from official docs; do not rely on memory)

- Next.js (App Router) + TypeScript, strict mode
- MapLibre GL JS with globe projection (check current docs for how to enable it)
- SQLite via better-sqlite3
- zod for validating external data and request params
- vitest for tests

Ask before adding any dependency not listed here. If you believe Python is better for the ETL step, propose it with reasons and wait for approval.

### Environment variables (.env.local, never committed; keep .env.example current)
- `WIKIMEDIA_CONTACT` (email or URL for the User-Agent on Wikimedia requests, required by their policy)
- `BASEMAP_STYLE_URL` (a provider with a free tier; do NOT hammer the public OpenStreetMap tile servers)

## Repo layout

```
/app                 Next.js routes and UI
/app/api/events      GET events by viewport + range
/app/api/area        GET area box contents (events, people and places)
/lib/db              SQLite access, queries
/lib/time            year conventions, range helpers
/lib/narrative       story checker, input, publish, staleness
/stories            featured stories, frozen inputs, RULES.md, published.json
/etl                 scripts: fetch, normalize, load
/etl/classes.json    category -> root class config
/data                local SQLite file (gitignored)
/docs                PLAN.md, data-audit.md, decisions.md
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
- The UI must show inherited locations differently (hollow dots, "approximate location" in the panel).

### Categories
conflict | disaster | politics | founding | culture | science | other. Mapping from Wikidata classes lives in `/etl/classes.json`.

### Schema (starting point; adjust if justified and log the change)

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
  loc_source TEXT,              -- P625 | P276 | P131
  sitelinks INTEGER NOT NULL,   -- notability proxy
  wikipedia_title TEXT
);
CREATE INDEX idx_events_years ON events(start_year, end_year);
CREATE INDEX idx_events_geo ON events(lat, lon);
```

Consider an R*Tree index if bbox queries are slow. Measure before optimizing.

### Licensing and attribution
Wikidata data is CC0. Wikipedia text is CC BY-SA, so attribute and link to the source page wherever extracts or stories derived from them are shown. Credit the basemap provider. Put attributions in the UI footer and README.

## Working agreements

- One phase at a time. At the end of each phase: summarize what was done, show acceptance results, then STOP for the owner's go-ahead.
- Small, focused commits. Run tests and typecheck before each commit.
- Never hardcode Wikidata QIDs from memory. Resolve by label lookup, verify against the live endpoint, and record them with labels in `/etl/classes.json`.
- When an external API returns an unexpected shape, save a fixture in `/tests/fixtures` and write a test.
- Record non-obvious decisions in `docs/decisions.md`, starting with the seven above.
- No secrets in the repo. Respect every site's usage policy; no abusive scraping.
- If requirements are ambiguous or a phase gate fails, ask instead of guessing.
