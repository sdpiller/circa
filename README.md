# Chronoglobe

A 3D globe of human history. Spin and zoom the globe, pick a year range (about 3500 BCE to today), and see notable historical events as dots. Click an area to get the events there, plus a short narrative written by Claude that is grounded only in those events and cites each one.

The narrative is the point; the globe is how you get to it.

## Status

Work in progress, built in phases (see [docs/PLAN.md](docs/PLAN.md)).

- **Done (Phases 0 to 3):** project scaffold, year-convention library, a Wikidata fetch and data audit ([docs/data-audit.md](docs/data-audit.md)), a local SQLite database of about 255,000 dated, located items (events, settlement foundings, structures and sites, notable births, and discoveries), the events API, and the globe: spin and zoom, pick a year range, hover a dot for its name and date.
- **Not built yet:** the area panel (click for the events in an area) and the narratives.

## Requirements

- Node.js 22.18 or newer (scripts run TypeScript directly, with no build step)
- npm

## Setup

```bash
npm ci
cp .env.example .env.local
```

Then edit `.env.local`. For the current phase only `WIKIMEDIA_CONTACT` is needed, and only to fetch data:

| Variable | Needed for | Notes |
| --- | --- | --- |
| `WIKIMEDIA_CONTACT` | Data fetch | An email or URL. Wikimedia's User-Agent policy requires a contact on every request. |
| `ANTHROPIC_API_KEY` | Narratives (later phase) | Never commit it. |
| `ANTHROPIC_MODEL` | Narratives (later phase) | Defaults to `claude-sonnet-5-5`. |
| `BASEMAP_STYLE_URL` | Globe (optional) | Defaults to OpenFreeMap's dark style (free, no key). Read at build time. Do not use the public OpenStreetMap tile servers. |

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit tests (vitest). |
| `npm run typecheck` | Generate Next.js route types and run the TypeScript compiler. |
| `npm run lint` | Run ESLint. |
| `npm run etl` | Fetch whatever is missing, then build the database. One command from nothing to `data/chronoglobe.db`. |
| `npm run etl:fetch` | Download event data from Wikidata into `data/raw/`. See below. |
| `npm run etl:load` | Build `data/chronoglobe.db` from `data/raw/` (about 7 seconds). |
| `npm run audit` | Rebuild the tables in `docs/data-audit.md` from `data/raw/`. |
| `npm run bench:events` | Time events API queries against the real database, per zoom band. |
| `npm run dev` | Start the Next.js dev server on http://localhost:3000. |

## Fetching the data

```bash
npm run etl:fetch                                 # everything
npm run etl:fetch -- --only=battle,siege          # some classes
npm run etl:fetch -- --only=battle --facets=dates # one kind of detail
npm run etl:fetch -- --force                      # re-download instead of skipping
```

The classes to fetch (battles, sieges, earthquakes, and so on) and their Wikidata IDs live in [etl/classes.json](etl/classes.json).

How it works, briefly:

- For each class, one query lists the matching items and their sitelink counts. Then labels, dates, and locations are looked up in batches of 1,000 items.
- Queries go to the public Wikidata Query Service, except three very large class listings, which go to the public [QLever](https://qlever.dev) Wikidata endpoint. Both services are free and shared, so requests run one at a time with a pause in between, and failed requests back off.
- Every batch is saved as its own file under `data/raw/` (gitignored). If a run stops, rerunning it skips what is already there and continues.
- A full run makes about a thousand small queries and takes roughly an hour. The raw files take well over 100 MB.

## Building the database

`npm run etl:load` turns the raw files into `data/chronoglobe.db` (SQLite, about 70 MB). It normalizes every item (dates, location, label), keeps one record per Wikidata item, drops items outside 3500 BCE to today or with dates vaguer than 1,000 years, and validates every row. It builds into a temp file, checks four famous events (Marathon, Thermopylae, Vesuvius in 79, the fall of Constantinople), and only then replaces the old database, so a failed build never breaks a working one. Running it twice gives identical data.

On Windows, stop the dev server before rebuilding: the final rename fails while another process has the database open. Check that it really stopped: killing `npm run dev` can leave Next's worker process running, still holding the file.

## Events API

`GET /api/events?west=&south=&east=&north=&from=&to=&zoom=` returns the dots for a viewport.

- `west`, `south`, `east`, `north`: the visible bounding box in degrees. A box with `west` greater than `east` crosses the antimeridian; unwrapped longitudes such as `-200` are accepted.
- `from`, `to`: the year range, as whole years with BCE negative (490 BCE is `-490`). There is no year 0. Both must lie between -3500 and 2026. An item matches if its date interval overlaps the range, so a date known only to the century matches any range that touches that century.
- `zoom`: the MapLibre zoom level (0 to 24). It sets how many dots come back: 150 at globe scale up to 600 at city scale, split across kinds (events 40%, foundings 20%, structures 15%, births 15%, discoveries 10%), each ranked by how many Wikipedia language editions cover it.

The response is `{ quotas, events }`, where each event has `qid`, `label`, `kind`, `category`, `start_year`, `end_year`, `lat`, `lon`, `loc_confidence`, and `sitelinks`. Invalid parameters give a 400 with a list of issues. The `Server-Timing` header reports the database time.

The reasoning behind these choices, including the Wikidata year-zero trap and why the queries are shaped the way they are, is in [docs/decisions.md](docs/decisions.md).

## Repository layout

```
app/         Next.js app: the globe (app/ui) and the events API (app/api/events)
lib/dots.ts  Dot legend groups, colours, and the GeoJSON the globe draws
lib/time/    Year conventions: no year 0, BCE as negative years, imprecise-date intervals
lib/db/      Database schema, row validation, connection, and the events query
etl/         Fetch, normalize, build, load, and audit scripts, plus classes.json
tests/       Unit tests and live API fixtures
docs/        PLAN.md, decisions.md, data-audit.md
data/        Local data, gitignored
```

## Data and attribution

- **Wikidata:** event data (labels, dates, coordinates, sitelink counts) comes from [Wikidata](https://www.wikidata.org), available under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Wikipedia:** later phases will show short extracts from Wikipedia articles and use them to ground narratives. Wikipedia text is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the app will credit and link the source article wherever an extract or a narrative based on one appears.
- **Query services:** data is fetched through the [Wikidata Query Service](https://query.wikidata.org) and [QLever](https://qlever.dev) (University of Freiburg).
- **Basemap:** [OpenFreeMap](https://openfreemap.org), © [OpenMapTiles](https://openmaptiles.org), data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Credited in the app footer and the map's attribution control.
- **Map library:** [MapLibre GL JS](https://maplibre.org) (BSD 3-Clause).

Coverage is uneven: Wikidata documents some regions and eras far better than others. Documented history is not the same as history.
