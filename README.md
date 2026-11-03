# Circa

A 3D globe of human history, at [samarchive.com/circa](https://samarchive.com/circa). The globe starts blank, on warm paper. Pick a year range (about 3500 BCE to today) and click anywhere: an outline appears around the region that mattered in those years, and a reading column lists the notable events, people and places inside it. For twenty featured places and eras, the column opens with a short story written by Claude from the Wikipedia and Wikidata text of the items it cites, with a clickable citation on every sentence.

The story is the point; the globe is how you get to it.

## Status

Work in progress, built in phases (see [docs/PLAN.md](docs/PLAN.md)).

- **Done (Phases 0 to 6):** project scaffold, year-convention library, a Wikidata fetch and data audit ([docs/data-audit.md](docs/data-audit.md)), a local SQLite database of about 255,000 dated, located items, historical outlines built from three open boundary datasets, the cream globe with names by zoom, the area panel (events, people and places, Wikipedia paragraphs and hover cards), and twenty featured stories reachable by clicking or from a Stories list.
- **In progress:** deployment (Phase 7), as Circa (formerly Chronoglobe) at samarchive.com/circa.
- **Outlines are approximate.** They are built from modern provinces and labelled as such. They are not authoritative maps.

## Requirements

- Node.js 22.18 or newer (scripts run TypeScript directly, with no build step)
- npm

## Setup

```bash
npm ci
cp .env.example .env.local
```

Then edit `.env.local`. `WIKIMEDIA_CONTACT` is needed to fetch data and, since Phase 4, to load Wikipedia summaries in the area box (without it `/api/summary` returns 503):

| Variable | Needed for | Notes |
| --- | --- | --- |
| `WIKIMEDIA_CONTACT` | Data fetch, area box | An email or URL. Wikimedia's User-Agent policy requires a contact on every request. |
| `BASEMAP_STYLE_URL` | Globe (optional) | Defaults to OpenFreeMap's positron style (free, no key), recoloured to cream in the browser. Read at build time. Do not use the public OpenStreetMap tile servers. |

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit tests (vitest). |
| `npm run typecheck` | Generate Next.js route types and run the TypeScript compiler. |
| `npm run lint` | Run ESLint. |
| `npm run etl` | Fetch whatever is missing (events, then boundaries), then build the database. One command from nothing to `data/circa.db`. It does not run the story steps. |
| `npm run etl:fetch` | Download event data from Wikidata into `data/raw/`. See below. |
| `npm run etl:boundaries` | Download the three boundary datasets (Natural Earth, Cliopatria, historical-basemaps) into `data/raw/boundaries/`, pinned to commits. See below. |
| `npm run etl:load` | Build `data/circa.db` from `data/raw/`, including provinces, regions and each event's province. Also rewrites [docs/region-names.md](docs/region-names.md). |
| `npm run story:publish` | Check every story against its frozen input, place it by the provinces of its cited items (needs the database), and write `stories/published.json`. |
| `npm run story:check` | Run after `etl:load`: reports published stories whose cited items changed (stale, exit 1) or whose point or provinces no longer match the database (out of date, exit 1, fix with `story:publish`). |
| `npm run audit` | Rebuild the tables in `docs/data-audit.md` from `data/raw/`. |
| `npm run bench:area` | Time click queries against the real database and check the outline and lists they return (target 150 ms; decisions.md entry 32 has what it measured). |
| `npm run db:fetch` | Runs before every build: downloads `data/circa.db` from `CIRCA_DB_URL` when it is missing, and fails unless it matches `etl/circa-db.sha256`. |
| `npm run open-data` | Runs before every build: writes the processed historical-basemaps outlines (GPL-3.0) to `public/open-data/`. |
| `npm run dev` | Start the Next.js dev server; the app is at http://localhost:3000/circa. |

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

## Fetching the boundaries

```bash
npm run etl:boundaries
```

Three datasets, each pinned to a commit in `etl/boundaries.ts` and saved under `data/raw/boundaries/` (gitignored). Files already on disk are skipped. The downloads are large (Cliopatria alone is 173 MB unzipped), so the first run takes a while.

## Building the database

`npm run etl:load` turns the raw files into `data/circa.db` (SQLite, about 175 MB). It loads the boundary data (regions are simplified at 0.02 degrees and coordinates rounded to 3 decimals), assigns each event to the province holding it (or the nearest within 150 km), normalizes every item (dates, location, label), keeps one record per Wikidata item, drops items outside 3500 BCE to today or with dates vaguer than 1,000 years, and validates every row. It builds into a temp file, checks four famous events (Marathon, Thermopylae, Vesuvius in 79, the fall of Constantinople), and only then replaces the old database, so a failed build never breaks a working one. Running it twice gives identical data.

The order after a rebuild is `npm run etl:load`, then `npm run story:check`, and `npm run story:publish` only if `story:check` says a story is out of date. `story:publish` needs the database.

After every rebuild, run `npm run story:check`. It confirms each published featured story still cites items that exist, with the same labels and years and a province, and prints a stale story's id and reason (exit 1). If the stored point or provinces changed, it says so (exit 1) and `npm run story:publish` fixes it.

On Windows, stop the dev server before rebuilding: the final rename fails while another process has the database open. Check that it really stopped: killing `npm run dev` can leave Next's worker process running, still holding the file.

## Area API

`GET /circa/api/area?lat=&lon=&from=&to=&intent=` answers one click. The app is served under `/circa` (`lib/base.ts`).

- `lat`, `lon`: the click, with `lon` between -180 and 180.
- `from`, `to`: the year range, as whole years with BCE negative (490 BCE is `-490`). There is no year 0. An item matches if its date interval overlaps the range.
- `intent`: `click` (a story opens if the click is in one of its provinces and the ranges overlap enough) or `range` (a slider change or a Stories entry: a story shows only on an exact match).
- `eventsLimit`, `othersLimit` (optional): how many events, and how many people and places, to list. They default to 25 and 30.

The response holds `selection` (kind historical, modern or none, with its name, source, scale facts and outline GeoJSON), `storyId` (or null), the `from` and `to` actually used (a click can move the range to a story's years), and the `events` and `others` lists with their totals. Invalid parameters give a 400 with a list of issues. `GET /circa/api/outline?lat=&lon=&from=&to=` returns only the outline a click there would draw, for the hover preview. `GET /circa/api/summary?qid=` returns the Wikipedia extract for an item.

The reasoning behind these choices, including the Wikidata year-zero trap, how a click picks its outline, and what was measured, is in [docs/decisions.md](docs/decisions.md), entries 25 to 32.

## Deploying

Circa runs on Vercel as its own project, served at samarchive.com/circa through a rewrite in samarchive's config (decisions.md entry 34). The database is not in git: it is a public file in Vercel Blob, and each build downloads it.

After `npm run etl:load` changes the database, `etl/circa-db.sha256` changes with it. Upload the new `data/circa.db` to Blob, set the project's `CIRCA_DB_URL` to its address, and commit the new hash; a build whose download does not match the committed hash fails.

| Variable (Vercel project) | Value |
| --- | --- |
| `CIRCA_DB_URL` | The public Blob URL of the `data/circa.db` this commit expects. |
| `WIKIMEDIA_CONTACT` | As in development. |

## Repository layout

```
app/         Next.js app: the globe (app/ui) and the APIs (app/api)
lib/time/    Year conventions: no year 0, BCE as negative years, imprecise-date intervals
lib/geo/     Point in polygon, distance, area, and merging provinces into an outline
lib/outline/ Which region a click gets, and the scale line
lib/db/      Database schema, row validation, connection, and the area query
lib/narrative/  Featured-story checker, publish, and staleness check
stories/     Featured stories, frozen inputs, writing rules, published.json
etl/         Fetch, boundaries, normalize, build, load, story, bench, and audit scripts, plus classes.json
tests/       Unit tests and live API fixtures
docs/        PLAN.md, decisions.md, data-audit.md, region-names.md
data/        Local data, gitignored
```

## Licenses

- **Code** (`app/`, `lib/`, `etl/`, `tests/` and the rest unless listed below): [MIT](LICENSE).
- **Stories** (`stories/`): [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The frozen inputs in `stories/inputs/` hold extracts of English Wikipedia articles, each named by its `wikipedia_title`, and the stories are written from them, so they share Wikipedia's license. Credit: Wikipedia contributors, and Wikidata for the item data.
- **`etl/licenses/GPL-3.0.txt`** is the GNU General Public License text, published with the processed historical-basemaps outlines (below).
- **Data** is not in this repository; the sources and their licenses are listed next.

This is not legal advice.

## Data and attribution

- **Wikidata:** event data (labels, dates, coordinates, sitelink counts) comes from [Wikidata](https://www.wikidata.org), available under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Wikipedia:** the area box shows short extracts from Wikipedia articles, and the featured stories are written from them. Wikipedia text is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the story credit names Wikipedia and Wikidata with links to those sites, and each cited item links to its own article from its row in the box.
- **Query services:** data is fetched through the [Wikidata Query Service](https://query.wikidata.org) and [QLever](https://qlever.dev) (University of Freiburg).
- **Natural Earth:** admin-1 provinces from [Natural Earth](https://www.naturalearthdata.com), public domain. Every outline is built from them.
- **Cliopatria:** historical polities from [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat Global History Databank), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The shapes are processed: matched to provinces and merged.
- **historical-basemaps:** historical atlas regions from [historical-basemaps](https://github.com/aourednik/historical-basemaps), GPL-3.0. Some of its labels are broad ("Semites", "Bantu"); the panel says so. The outlines as Circa processed them are published with the site under GPL-3.0, with credit: `npm run open-data` writes them to `public/open-data/` before every build (gzipped GeoJSON, a README on what was changed, and the license text), and the Sources list in the app links to them. Not legal advice.
- **Basemap:** [OpenFreeMap](https://openfreemap.org), © [OpenMapTiles](https://openmaptiles.org), data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Credited in the app footer and the map's attribution control. The app also credits the three boundary datasets above.
- **Map library:** [MapLibre GL JS](https://maplibre.org) (BSD 3-Clause).

Coverage is uneven: Wikidata documents some regions and eras far better than others. Documented history is not the same as history.
