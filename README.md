# Chronoglobe

A 3D globe of human history. Spin and zoom the globe, pick a year range (about 3500 BCE to today), and see notable historical events as dots. Click an area to get the events there, plus a short narrative written by Claude that is grounded only in those events and cites each one.

The narrative is the point; the globe is how you get to it.

## Status

Work in progress, built in phases (see [docs/PLAN.md](docs/PLAN.md)).

- **Done (Phase 0):** project scaffold, year-convention library with tests, and a Wikidata fetch plus data audit. The audit results are in [docs/data-audit.md](docs/data-audit.md).
- **Not built yet:** the database loader, the events API, the globe UI, the area panel, and the narratives. `npm run dev` currently shows only the default starter page.

## Requirements

- Node.js 22.18 or newer (scripts run TypeScript directly, with no build step)
- npm

## Setup

```bash
npm ci
cp .env.example .env.local
```

Then edit `.env.local`. For the current phase only `WIKIMEDIA_CONTACT` is needed:

| Variable | Needed for | Notes |
| --- | --- | --- |
| `WIKIMEDIA_CONTACT` | Data fetch | An email or URL. Wikimedia's User-Agent policy requires a contact on every request. |
| `ANTHROPIC_API_KEY` | Narratives (later phase) | Never commit it. |
| `ANTHROPIC_MODEL` | Narratives (later phase) | Defaults to `claude-sonnet-5-5`. |
| `BASEMAP_STYLE_URL` | Globe (later phase) | A tile provider with a free tier. Do not use the public OpenStreetMap tile servers. |

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit tests (vitest). |
| `npm run typecheck` | Generate Next.js route types and run the TypeScript compiler. |
| `npm run lint` | Run ESLint. |
| `npm run etl:fetch` | Download event data from Wikidata into `data/raw/`. See below. |
| `npm run audit` | Rebuild the tables in `docs/data-audit.md` from `data/raw/`. |
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

The reasoning behind these choices, including the Wikidata year-zero trap and why the queries are shaped the way they are, is in [docs/decisions.md](docs/decisions.md).

## Repository layout

```
app/         Next.js app (starter page for now)
lib/time/    Year conventions: no year 0, BCE as negative years, imprecise-date intervals
etl/         Fetch, normalize, and audit scripts, plus classes.json
tests/       Unit tests and live API fixtures
docs/        PLAN.md, decisions.md, data-audit.md
data/        Local data, gitignored
```

## Data and attribution

- **Wikidata:** event data (labels, dates, coordinates, sitelink counts) comes from [Wikidata](https://www.wikidata.org), available under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Wikipedia:** later phases will show short extracts from Wikipedia articles and use them to ground narratives. Wikipedia text is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the app will credit and link the source article wherever an extract or a narrative based on one appears.
- **Query services:** data is fetched through the [Wikidata Query Service](https://query.wikidata.org) and [QLever](https://qlever.dev) (University of Freiburg).
- **Basemap:** the tile provider will be credited here and in the app footer once one is chosen.

Coverage is uneven: Wikidata documents some regions and eras far better than others. Documented history is not the same as history.
