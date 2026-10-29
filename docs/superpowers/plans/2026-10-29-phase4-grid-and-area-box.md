# Phase 4: Grid View and Area Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "dots everywhere" with a plain globe, an H3 grid from zoom 3, optional dots that merge into stacks with a hover web, and a box listing a clicked cell's events and people and places, with Wikipedia paragraphs and hover cards.

**Architecture:** H3 cells at resolutions 2 to 5 are precomputed per row at load time, so `/api/cells` (grid) and `/api/area` (box) are plain SQLite filters and GROUP BYs. Wikipedia page summaries are fetched server-side by `/api/summary` and cached in a separate writable `data/cache.db`. The client adds grid, highlight, and stack layers to the existing MapLibre map, a DOM overlay for the web, and a box component.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, MapLibre GL 6, better-sqlite3, h3-js 4 (new, listed in CLAUDE.md's stack), zod 4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-area-panel-design.md` (sections 2, 3, 6). Phase 5 (the story) is out of scope.

**Deviation from spec 3.1, decided while planning:** the summaries cache lives in its own file `data/cache.db`, not a table in `chronoglobe.db`. The app opens `chronoglobe.db` read-only, and an open handle blocks `etl:load`'s rename on Windows; a separate file needs no carry-over on rebuild. Record this in decision 29 (Task 9).

## Global Constraints

- Never use em dashes in code comments, UI copy, docs, or commit messages. Use commas, colons, or periods.
- The only new dependency is `h3-js` (`npm install h3-js@^4.5.0`). Verify its API from the installed package's README and types, not from memory.
- Years are historical (1 BCE = -1, no year 0). Range filters use overlap: `start_year <= @to AND end_year >= @from`.
- Grid resolutions are exactly 2, 3, 4, 5. The finest is r5. The grid and dots appear from `GRID_MIN_ZOOM = 3`. Below it: no grid, no dots, no clicks.
- "Events" in the box, in shading counts, and in `events` columns means kinds `event` and `discovery`. "People and places" (`others`) means `birth`, `founding`, `structure`.
- Box limits: 25 events, 30 people and places by default. "Show more" raises a limit by those steps, capped at 200.
- Text from Wikidata and Wikipedia is rendered as text (React text nodes or `textContent`), never as HTML. Never use `extract_html` or `displaytitle`.
- Show a Wikipedia thumbnail only if its URL contains `/wikipedia/commons/` (Commons hosts only freely licensed files; enwiki-local images may be non-free).
- Wikimedia requests send `User-Agent: Chronoglobe/0.1 (${WIKIMEDIA_CONTACT})`. If `WIKIMEDIA_CONTACT` is unset, `/api/summary` returns 503 and makes no outbound request.
- Exact UI copy: "Zoom in to explore"; "Nothing documented here for {range}"; "Area about {N} km across, {range}"; "approximate location"; "No English Wikipedia article"; "Could not load from Wikipedia"; "born here", "dated", "founded", "discovered here" (from `lib/dots.ts`). `{range}` is `formatRange(from, to)` from `lib/time`.
- Dot colours stay as decision 26. Any new colour drawn under or beside dots (grid fill, stack dot, web lines) is checked with the dataviz skill's validator before commit (Task 6, Task 7).
- Before every commit: `npm test`, `npm run typecheck`, `npm run lint` all pass. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stop the dev server before `npm run etl:load` (an open read-only handle makes the rename fail with EPERM on Windows).

## Review Focus

1. **A dot whose item is outside the box's top 25 or 30** (a minor birth on a stack leg). Expect the box to include and highlight it anyway. Pinned by `focus` tests in Task 4.
2. **Wikipedia titles with `/`, `?`, `&`, `#`, or non-ASCII characters** (for example "AC/DC", "Ségou Empire"). Expect a correct summary, not a 404 or a wrong page. Pinned by the URL-building test in Task 5.
3. **Wikipedia down, slow, or rate limiting (429), or `WIKIMEDIA_CONTACT` unset.** Expect the list to still show, the paragraph to read "Could not load from Wikipedia", and nothing cached, so a later try can succeed. Pinned by the "errors are not cached" test in Task 5.
4. **A cell straddling the antimeridian** (Fiji, Chukotka). Expect a normal hexagon, not a band wrapped around the planet. Pinned by the `cellPolygon` test in Task 1.
5. **Changing the range while the box is open so its cell becomes empty.** Expect "Nothing documented here for {range}" with the outline still highlighted, and no stale result from the old range arriving late. Pinned by the empty-range `queryArea` test in Task 4 and the manual check in Task 8.

---

## File map

| File | Responsibility |
|---|---|
| `lib/cells.ts` (new) | Zoom to resolution, cell ids for a point, cell size, cell outline polygon. Pure, runs in browser and server. |
| `lib/db/schema.ts` (modify) | Four `h3_rN` columns and their indexes. |
| `etl/load.ts` (modify) | Computes the cell columns on insert. |
| `tests/helpers.ts` (new) | `row()` and `makeDb()` shared by DB tests, inserting by column name. |
| `lib/db/cells.ts` (new) | `CellsQuery`, `queryCells`. |
| `app/api/cells/route.ts` (new) | GET grid cells. |
| `lib/db/area.ts` (new) | `AreaQuery`, `queryArea`. |
| `app/api/area/route.ts` (new) | GET box contents. |
| `lib/wiki/summary.ts` (new) | Wikipedia summary types, parsing, URL, fetch, cache logic. |
| `lib/db/cache.ts` (new) | Writable connection to `data/cache.db`, `summaries` table. |
| `app/api/summary/route.ts` (new) | GET summary through the cache. |
| `etl/bench-cells.ts` (new) | Seeded benchmark of `queryCells` and `queryArea`. |
| `lib/web.ts` (new) | Web geometry and leg selection. Pure. |
| `app/ui/GlobeMap.tsx` (modify) | Grid, highlight, stack layers, click routing, dots toggle, web overlay host. |
| `app/ui/DotWeb.tsx` (new) | The animated web overlay. |
| `app/ui/AreaBox.tsx` (new) | The box: header, events, people and places, show more, footer. |
| `app/ui/SummaryText.tsx`, `app/ui/HoverCard.tsx` (new) | Expanded paragraph and hover card, both via `useSummary`. |
| `app/ui/useSummary.ts` (new) | Client fetch of `/api/summary` with in-memory dedupe. |
| `app/ui/GlobeApp.tsx`, `app/ui/globe.module.css` (modify) | Selection state, dots toggle, hint, legend status, footer credit. |

---

### Task 1: Cell helpers

**Files:**
- Create: `lib/cells.ts`
- Test: `tests/cells.test.ts`
- Modify: `package.json` (add `h3-js`)

**Interfaces:**
- Produces:
  - `export const GRID_MIN_ZOOM = 3;`
  - `export const RESOLUTIONS = [2, 3, 4, 5] as const; export type Res = (typeof RESOLUTIONS)[number];`
  - `export const RES_BANDS = [{ minZoom: 3, res: 2 }, { minZoom: 4.3, res: 3 }, { minZoom: 5.6, res: 4 }, { minZoom: 7, res: 5 }] as const;` (cells about 30 to 80 px across on screen; tune by eye in Task 6 and keep the test in step)
  - `export function resolutionForZoom(zoom: number): Res | null` (null below `GRID_MIN_ZOOM`)
  - `export type CellColumns = { h3_r2: string; h3_r3: string; h3_r4: string; h3_r5: string };`
  - `export function cellsForPoint(lat: number, lon: number): CellColumns`
  - `export function cellAcrossKm(res: Res): number` (2 × average edge length in km, rounded to a whole km: r2 316, r3 120, r4 45, r5 17; assert against h3-js, not these numbers, if they differ)
  - `export function isGridCell(cell: string): boolean` (valid H3 cell whose resolution is in `RESOLUTIONS`)
  - `export function cellPolygon(cell: string): [number, number][]` (closed ring of `[lon, lat]`; if the ring spans more than 180 degrees of longitude, add 360 to each negative longitude so it draws as one hexagon)

- [ ] **Step 1: Install h3-js.** Run `npm install h3-js@^4.5.0`. Read `node_modules/h3-js/README.md` for `latLngToCell`, `cellToBoundary`, `getResolution`, `isValidCell`, `getHexagonEdgeLengthAvg`.
- [ ] **Step 2: Write the failing tests** in `tests/cells.test.ts`:
  - `resolutionForZoom`: `2.99 → null`, `3 → 2`, `4.29 → 2`, `4.3 → 3`, `5.6 → 4`, `7 → 5`, `22 → 5`.
  - `cellsForPoint(37.97, 23.73)` (Athens): each `h3_rN` is a valid cell of resolution N, and `h3_r5`'s parent at r2 equals `h3_r2` (use `cellToParent`).
  - `isGridCell`: true for `cellsForPoint(...).h3_r4`; false for `"zzz"`, `""`, and a valid r6 cell (`latLngToCell(37.97, 23.73, 6)`).
  - `cellAcrossKm(5)` is between 15 and 19; values strictly decrease from r2 to r5.
  - `cellPolygon` on a cell at `(-17.7, 179.95)` resolution 2: first point equals last; `max(lon) - min(lon) < 10`.
  - `cellPolygon` on the Athens r4 cell: every lon in `[23, 25]`.
- [ ] **Step 3: Run** `npx vitest run tests/cells.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement `lib/cells.ts`** with the signatures above. `cellPolygon` uses `cellToBoundary(cell, true)` (GeoJSON order, closed ring).
- [ ] **Step 5: Run** `npx vitest run tests/cells.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `lib/cells.ts tests/cells.test.ts package.json package-lock.json` as "Add H3 cell helpers for the grid".

### Task 2: Cell columns in the database

**Files:**
- Modify: `lib/db/schema.ts` (SCHEMA_SQL), `etl/load.ts:42-68` (`writeDatabase`)
- Create: `tests/helpers.ts`
- Modify: `tests/events.test.ts` (use the shared helpers)
- Test: `tests/load.test.ts`

**Interfaces:**
- Consumes: `cellsForPoint`, `CellColumns` (Task 1).
- Produces:
  - Columns on `events`: `h3_r2 TEXT NOT NULL, h3_r3 TEXT NOT NULL, h3_r4 TEXT NOT NULL, h3_r5 TEXT NOT NULL`, appended after `wikipedia_title`.
  - Indexes `idx_events_r2` to `idx_events_r5`, each on `(h3_rN)`. (Task 3's benchmark may replace them with covering indexes.)
  - `tests/helpers.ts`: `export function row(over?: Partial<EventRow>): EventRow` (the defaults now in `tests/events.test.ts`) and `export function makeDb(rows: EventRow[]): Database.Database` (in-memory, `SCHEMA_SQL`, inserts by column name with `cellsForPoint(lat, lon)` merged in, then `ANALYZE`).

- [ ] **Step 1: Move** `row` and `makeDb` from `tests/events.test.ts` into `tests/helpers.ts`, switching the insert to named columns including the four cell columns. Import them in `tests/events.test.ts`. Run `npx vitest run tests/events.test.ts`. Expected: FAIL (no `h3_r2` column yet).
- [ ] **Step 2: Write the failing test** in `tests/load.test.ts`: after `writeDatabase` on two rows (Athens and a point at `(-17.7, 179.95)`), each stored `h3_rN` equals `cellsForPoint(lat, lon)` for that row, and `PRAGMA index_list(events)` includes `idx_events_r2` to `idx_events_r5`.
- [ ] **Step 3: Implement.** Add the columns and indexes to `SCHEMA_SQL` with a comment pointing to decision 28. In `writeDatabase`, add the four columns to the INSERT and pass `{ ...row, ...cellsForPoint(row.lat, row.lon) }`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including the existing 121.
- [ ] **Step 5: Rebuild the real database.** Stop any dev server, then run `npm run etl:load`. Expected: the four spot checks pass and the row count is unchanged (255,475). Note the new file size for decision 29.
- [ ] **Step 6: Commit** schema, loader, and tests as "Store H3 cells r2 to r5 per row".

### Task 3: Grid cells query, API, and benchmark

**Files:**
- Create: `lib/db/cells.ts`, `app/api/cells/route.ts`, `etl/bench-cells.ts`
- Modify: `package.json` (script `"bench:cells": "node etl/bench-cells.ts"`)
- Test: `tests/cells-query.test.ts`

**Interfaces:**
- Consumes: `resolutionForZoom`, `Res` (Task 1); `lonRanges` from `lib/db/events.ts`; `makeDb`, `row` (Task 2).
- Produces:
  - `export const CellsQuery` (zod): the same fields and rules as `EventsQuery` (`west, south, east, north, from, to, zoom`). Reuse `EventsQuery` directly if nothing differs. `export type CellsQueryInput = z.output<typeof CellsQuery>;`
  - `export type GridCell = { cell: string; items: number; events: number };`
  - `export type CellsResult = { res: Res | null; cells: GridCell[] };`
  - `export function queryCells(db: Database.Database, q: CellsQueryInput): CellsResult` (`res: null, cells: []` below `GRID_MIN_ZOOM`, with no query run)

- [ ] **Step 1: Write the failing tests:**
  - Two Athens rows (kinds `event` and `birth`) and one Rome `discovery`, zoom 7 (r5), world bbox, range covering all: two cells; Athens `{ items: 2, events: 1 }`, Rome `{ items: 1, events: 1 }`.
  - A row with years `-500..-401` appears for range `-450..-300` (overlap) and not for `-400..-300`.
  - A row at lon 179.9 appears for a bbox `west: 170, east: -170` (crosses the antimeridian).
  - Zoom 2.5 returns `{ res: null, cells: [] }`.
  - The SQL column comes from a whitelist: `queryCells` at zoom 4.3 groups by `h3_r3` (assert the returned cell's resolution is 3).
- [ ] **Step 2: Run** `npx vitest run tests/cells-query.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `queryCells`.** One prepared statement per resolution, the column name interpolated only from `RESOLUTIONS`:

```sql
SELECT h3_rN AS cell, COUNT(*) AS items, SUM(kind IN ('event', 'discovery')) AS events
FROM events
WHERE start_year <= @to AND end_year >= @from
  AND lat BETWEEN @south AND @north
  AND (lon BETWEEN @w1 AND @e1 OR lon BETWEEN @w2 AND @e2)
GROUP BY h3_rN
```

- [ ] **Step 4: Implement `app/api/cells/route.ts`** following `app/api/events/route.ts`: 400 with issues on bad input, `Server-Timing: db;dur=…`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Benchmark.** Write `etl/bench-cells.ts` modelled on `etl/bench-events.ts` (same seeded RNG, 300 viewports per band centred on real event locations, random year ranges), with bands for zoom 3, 4.3, 5.6, 7 and viewports sized as MapLibre shows them at a 1440×900 window. Time `queryCells` and, for one random returned cell per viewport, `queryArea` from Task 4 (add that half after Task 4 lands, or run this step after Task 4). Report p50, p95, max per band. Run `npm run bench:cells`.
- [ ] **Step 7: Decide on indexes by measurement.** If any band's max is above 100 ms, try a covering index `(start_year, end_year, lat, lon, kind, h3_rN)` or a per-resolution variant, re-run, and keep the smallest change that brings the max under 100 ms. Record before and after numbers for decision 29 (Task 9). If nothing gets under 100 ms, stop and report to the owner.
- [ ] **Step 8: Commit** as "Grid cells API with benchmark".

### Task 4: Area query and API

**Files:**
- Create: `lib/db/area.ts`, `app/api/area/route.ts`
- Test: `tests/area.test.ts`

**Interfaces:**
- Consumes: `isGridCell`, `cellAcrossKm`, `Res` (Task 1); `makeDb`, `row` (Task 2); `getResolution` from h3-js.
- Produces:
  - `export const AreaQuery` (zod): `cell` (string, `isGridCell`), `from`, `to` (same year rules as `EventsQuery`, `from <= to`), `eventsLimit` and `othersLimit` (optional ints 1 to 200, defaults 25 and 30), `focus` (optional, `/^Q\d+$/`).
  - `export type AreaItem = Pick<EventRow, "qid" | "label" | "description" | "kind" | "category" | "start_year" | "end_year" | "loc_confidence" | "wikipedia_title" | "sitelinks">;`
  - `export type AreaResult = { cell: string; res: Res; acrossKm: number; events: AreaItem[]; eventsTotal: number; others: AreaItem[]; othersTotal: number };`
  - `export function queryArea(db: Database.Database, q: AreaQueryInput): AreaResult`
  - `GET /api/area?cell&from&to[&eventsLimit&othersLimit&focus]` returns `AreaResult`, 400 on invalid input.

- [ ] **Step 1: Write the failing tests:**
  - Selection: the top `eventsLimit` events by sitelinks within the cell and range, returned sorted by `start_year` ascending, ties by sitelinks descending. `others` sorted by sitelinks descending. Totals count everything that matched, not only the returned rows.
  - Split: `discovery` lands in `events`; `birth`, `founding`, `structure` land in `others`.
  - Overlap: the same filter cases as Task 3.
  - A row in a neighbouring r5 cell is excluded.
  - **Focus (Review Focus 1):** with `othersLimit: 1` and two births, `focus` set to the less linked one returns both, and `othersTotal` is 2. A `focus` qid outside the cell or range changes nothing.
  - **Empty range (Review Focus 5):** a range with nothing in the cell returns empty lists and totals 0, with `cell`, `res`, `acrossKm` still set.
  - `AreaQuery` rejects an r6 cell, `"abc"`, `eventsLimit: 0`, `eventsLimit: 201`.
- [ ] **Step 2: Run** `npx vitest run tests/area.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Column `h3_r{getResolution(cell)}` from the whitelist. Two list queries (`kind IN ('event','discovery')` and the rest) with `ORDER BY sitelinks DESC LIMIT`, two `COUNT(*)` queries, and when `focus` is set and missing from its list, one lookup by `qid` with the same cell and range conditions, appended before sorting.
- [ ] **Step 4: Implement the route,** in the style of the events route.
- [ ] **Step 5: Run** `npm test`. Expected: PASS. Then finish Task 3 Step 6 (area timings) if it was deferred.
- [ ] **Step 6: Commit** as "Area box API: events and people and places for a cell".

### Task 5: Wikipedia summaries, cached

**Files:**
- Create: `lib/wiki/summary.ts`, `lib/db/cache.ts`, `app/api/summary/route.ts`, `tests/fixtures/wikipedia/summary-battle-of-marathon.json`, `tests/fixtures/wikipedia/summary-disambiguation.json`
- Modify: `.gitignore` if `data/cache.db` is not already covered by `data/`
- Test: `tests/summary.test.ts`

**Interfaces:**
- Produces:
  - `export type Summary = { title: string; description: string | null; extract: string; thumbnail: { source: string; width: number; height: number } | null; url: string };`
  - `export function summaryUrl(title: string): string` (`https://en.wikipedia.org/api/rest_v1/page/summary/` + `encodeURIComponent` of the title with spaces as `_`)
  - `export function parseSummary(json: unknown): Summary | "missing"` (zod; `type: "disambiguation"` or an empty extract is `"missing"`; drops a thumbnail not under `/wikipedia/commons/`; `url` from `content_urls.desktop.page`)
  - `export type SummaryCache = { get(title: string): { status: "ok"; summary: Summary } | { status: "missing" } | undefined; put(title: string, value: Summary | "missing"): void };`
  - `export async function getSummary(title: string, deps: { cache: SummaryCache; fetch: typeof fetch; contact: string | undefined; now?: () => number }): Promise<{ status: "ok"; summary: Summary } | { status: "missing" } | { status: "error"; reason: string }>`
  - `lib/db/cache.ts`: `export function getCacheDb(): Database.Database` (writable `data/cache.db`, created on first use, `journal_mode = WAL`, kept on `globalThis` like `connection.ts`) and `export function sqliteSummaryCache(db): SummaryCache` over `CREATE TABLE IF NOT EXISTS summaries (title TEXT PRIMARY KEY, status TEXT NOT NULL, body TEXT, fetched_at TEXT NOT NULL)`. Entries expire: `ok` after 30 days, `missing` after 7 days (expired entries read as `undefined`).
  - `GET /api/summary?title=…` returns 200 `Summary`, 404 `{ missing: true }`, 502 `{ error }` on upstream failure, 503 `{ error: "WIKIMEDIA_CONTACT is not set" }`, 400 on an empty or longer than 300 character title. Sets `Cache-Control: public, max-age=86400` on 200 and 404.

- [ ] **Step 1: Save fixtures.** Fetch `summaryUrl("Battle of Marathon")` and a disambiguation page (for example "Mercury") once with the proper User-Agent and save both responses. Saving fixtures of external shapes is a CLAUDE.md rule.
- [ ] **Step 2: Write the failing tests:**
  - `parseSummary(marathonFixture)`: title "Battle of Marathon", extract starts "The Battle of Marathon took place", thumbnail kept (Commons URL), url `https://en.wikipedia.org/wiki/Battle_of_Marathon`.
  - The same fixture with the thumbnail source changed to an `/wikipedia/en/` path gives `thumbnail: null`.
  - `parseSummary(disambiguationFixture)` is `"missing"`.
  - **Review Focus 2:** `summaryUrl("AC/DC")` ends `/page/summary/AC%2FDC`; `summaryUrl("Ségou Empire")` ends `/page/summary/S%C3%A9gou_Empire`; `summaryUrl("What?")` ends `What%3F`.
  - `getSummary` with an in-memory cache: a cache hit makes no fetch call; a 200 is parsed and stored; a 404 stores `"missing"`; the request carries `User-Agent: Chronoglobe/0.1 (me@example.com)`.
  - **Review Focus 3:** a thrown network error, a 429, and a 500 each return `{ status: "error" }` and store nothing; `contact: undefined` returns an error without calling fetch.
  - `sqliteSummaryCache` on an in-memory DB: put then get round-trips; an `ok` entry dated 31 days ago reads as `undefined`.
- [ ] **Step 3: Run** `npx vitest run tests/summary.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `lib/wiki/summary.ts` and `lib/db/cache.ts`. Concurrent requests for the same title share one in-flight promise (a module-level `Map`). Add a 5 s timeout via `AbortSignal.timeout(5000)`.
- [ ] **Step 5: Implement the route,** reading `process.env.WIKIMEDIA_CONTACT`.
- [ ] **Step 6: Run** `npm test`. Expected: PASS.
- [ ] **Step 7: Commit** as "Server-side Wikipedia summaries with a SQLite cache".

### Task 6: Plain globe, grid layer, dots toggle

**Files:**
- Modify: `app/ui/GlobeMap.tsx`, `app/ui/GlobeApp.tsx`, `app/ui/globe.module.css`

**Interfaces:**
- Consumes: `GRID_MIN_ZOOM`, `resolutionForZoom`, `cellPolygon` (Task 1); `CellsResult` (Task 3).
- Produces (props on `GlobeMap`, used by Tasks 7 and 8):
  - `showDots: boolean`
  - `selectedCell: string | null` (drawn as a highlight outline whether or not the grid currently has it)
  - `onSelect: (s: Selection) => void` with `export type Selection = { kind: "cell"; cell: string; focus?: string } | { kind: "empty"; lngLat: [number, number] };`
  - `MapStatus` gains `zoomedOut: boolean` and, when ready, `cells: number`.

- [ ] **Step 1: Grid data.** On the same debounced `moveend` and range schedule as dots: at zoom ≥ `GRID_MIN_ZOOM`, fetch `/api/cells` and set a `grid` GeoJSON source of polygons from `cellPolygon`, properties `{ cell, items, events }`. Below it, set the source empty and skip the dots fetch too. Keep the existing abort and identical-query skip, one controller per endpoint.
- [ ] **Step 2: Grid layers,** added beneath `dots`: `grid-fill` (fill colour `#e6e6e6`, `fill-opacity` interpolated on `events`: 0 → 0.03, 1 → 0.07, 10 → 0.13, 50 → 0.2) and `grid-line` (line colour `#e6e6e6`, opacity 0.25, width 0.75). Both fade in with a zoom interpolation between 3 and 3.5.
- [ ] **Step 3: Colour check.** Composite the maximum fill (0.2 of `#e6e6e6` over `#0c0c0c` and over `#1b1b1d`) and run the dataviz skill's validator for the four dot colours against those two backgrounds. If any pair fails, lower the top opacity until all pass, and record the final numbers for decision 29.
- [ ] **Step 4: Highlight layer.** `selected` source and line layer (width 2, colour `#ffffff`), fed from `selectedCell` via `cellPolygon`, drawn above `grid-line`.
- [ ] **Step 5: Dots toggle and hint.** `showDots` sets the `dots` layer's visibility; dots also hide below `GRID_MIN_ZOOM`. `GlobeApp` adds a "Show dots" checkbox in the legend panel (off by default), shows the dot legend groups only while dots are visible, and shows "Zoom in to explore" while `zoomedOut`. The status line reads "{cells} areas with documented history in view" when dots are off.
- [ ] **Step 6: Click routing,** in priority order with `queryRenderedFeatures` at the click point: a stack or a dot (Task 7 wires the stack) gives `{ kind: "cell", cell: latLngToCell(dot lat, lon, current res), focus: qid }`; a `grid-fill` feature gives `{ kind: "cell", cell }`; otherwise at zoom ≥ 3 `{ kind: "empty", lngLat }`; below zoom 3 nothing.
- [ ] **Step 7: Verify by eye** with `npm run dev`: plain globe at start; grid fades in at zoom 3 and refines at 4.3, 5.6, 7; stops refining past 7; Fiji draws normal hexagons; no console errors. Adjust `RES_BANDS` and its test together if cells look wrong in size.
- [ ] **Step 8: Run** the tests, typecheck, and lint. **Commit** as "Plain globe with an H3 grid and a dots toggle".

### Task 7: Stacks and the web

**Files:**
- Create: `lib/web.ts`, `app/ui/DotWeb.tsx`
- Modify: `app/ui/GlobeMap.tsx`, `lib/dots.ts` (add `sitelinks` to `DotProperties`), `app/ui/globe.module.css`
- Test: `tests/web.test.ts`

**Interfaces:**
- Produces:
  - `export const WEB_MAX_LEGS = 8;`
  - `export function pickLegs<T extends { sitelinks: number }>(items: T[]): { legs: T[]; more: number }` (top 8 by sitelinks; `more` is the rest)
  - `export function webOffsets(count: number, radiusPx: number): { x: number; y: number }[]` (evenly spaced on a circle, the first leg straight up, clockwise)
  - `DotWeb` props: `{ center: { x: number; y: number }; legs: DotProperties[]; more: number; onPick: (qid: string) => void; onMore: () => void; onLeave: () => void }`

- [ ] **Step 1: Write the failing tests:** `pickLegs` on 12 items returns the 8 most linked, in descending order, with `more: 4`; on 3 items it returns all with `more: 0`. `webOffsets(4, 50)` gives `(0,-50), (50,0), (0,50), (-50,0)` within 1e-9. `webOffsets(1, 50)` gives one point straight up.
- [ ] **Step 2: Run** `npx vitest run tests/web.test.ts`. Expected: FAIL. **Step 3: Implement** `lib/web.ts`. **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Clustering.** Turn the `dots` source into a clustered GeoJSON source (`cluster: true`, `clusterRadius` about one dot diameter, start at 8, and a `clusterMaxZoom` at the map's maximum zoom so identical coordinates never split; check MapLibre 6's docs for the allowed maximum and set the source `maxzoom` to match). Filter the `dots` layer to `["!", ["has", "point_count"]]`. Add a `stacks` circle layer and a `stack-count` symbol layer for the count. The stack's look is a builder's call within Global Constraints (validate any new colour).
- [ ] **Step 6: The web.** On `mouseenter` of `stacks`, get the members with `getClusterLeaves(clusterId, Infinity)` (check the Promise API in MapLibre 6), call `pickLegs`, and render `DotWeb` at `map.project(stack lngLat)`. Legs grow from the centre over about 250 ms (CSS transform), each a dot in its group colour (hollow if approximate) joined by a thin line, a ninth "+{more} more" leg when `more > 0`. Hovering a leg shows the existing tooltip content. Clicking a leg calls `onSelect({ kind: "cell", cell, focus: qid })`; clicking the centre or "+N more" selects the cell without a focus. The web stays open while the pointer is over the centre, a leg, or the area between them (one invisible circle of radius + 16 px), closes 300 ms after the pointer leaves, and closes immediately on map move or Escape. Respect `prefers-reduced-motion` by skipping the animation.
- [ ] **Step 7: Verify by eye:** Athens at zoom 8 with dots on, 500 to 300 BCE: births on the city point show as one stack; the web opens, animates, and closes as described; a 40-member stack shows 8 legs and "+32 more".
- [ ] **Step 8: Run** the tests, typecheck, and lint. **Commit** as "Merge overlapping dots into stacks with a hover web".

### Task 8: The area box

**Files:**
- Create: `app/ui/AreaBox.tsx`, `app/ui/useSummary.ts`, `app/ui/SummaryText.tsx`, `app/ui/HoverCard.tsx`
- Modify: `app/ui/GlobeApp.tsx`, `app/ui/globe.module.css`

**Interfaces:**
- Consumes: `Selection`, `selectedCell` (Task 6); `AreaResult`, `AreaItem` (Task 4); `/api/summary` and `Summary` (Task 5); `formatRange`, `DOT_GROUPS`, `groupOf` (existing).
- Produces: `useSummary(title: string | null, enabled: boolean): { state: "idle" | "loading" | "missing" | "error" } | { state: "ok"; summary: Summary }` (module-level `Map` cache so each title is fetched once per page load).

- [ ] **Step 1: Selection state in `GlobeApp`.** A `{ kind: "cell" }` selection sets `selectedCell` and opens the box. `{ kind: "empty" }` shows the one line "Nothing documented here for {range}" in place of the box, with no highlight. Close with a close button or Escape; closing clears `selectedCell`.
- [ ] **Step 2: Fetch.** `AreaBox` fetches `/api/area` for `(cell, range, limits, focus)`, aborting the previous request whenever any of them changes. A range change keeps the cell (Review Focus 5): if the result is empty, the box body reads "Nothing documented here for {range}" and the outline stays.
- [ ] **Step 3: Layout,** placed on the right so it never covers the centre of the map. Header "Area about {acrossKm} km across, {range}". Events: a row per item with `formatRange(start_year, end_year)`, the label, a group-colour swatch, the description (or nothing if null), and "approximate location" when inherited; "Show {n} more" when `eventsTotal > events.length`. People and places: names only, in a wrapping list, with "Show {n} more" likewise. Footer: "Descriptions from Wikidata. Paragraphs and pictures from Wikipedia (CC BY-SA), linked per item."
- [ ] **Step 4: Focus.** When `focus` is set, scroll that item into view and highlight it once the result arrives.
- [ ] **Step 5: Expand.** Clicking an event row toggles `SummaryText`: if `wikipedia_title` is null, "No English Wikipedia article" plus a link to `https://www.wikidata.org/wiki/{qid}`; otherwise `useSummary` with states "Loading", the extract plus "Read on Wikipedia" (link to `summary.url`), "No English Wikipedia article" for missing, "Could not load from Wikipedia" for error.
- [ ] **Step 6: Hover card.** Each person or place name is a focusable button. Pointer hover for 250 ms, or keyboard focus, opens `HoverCard`: thumbnail if any (`alt` = label), a kind line ("born here", "dated", "founded"), the summary description or the Wikidata description, the first two sentences of the extract, and "Read on Wikipedia". Without a title it shows the Wikidata description and a Wikidata link, with no fetch. It closes on pointer leave, blur, or Escape. Moving the pointer quickly over the list must not fire a request per name (only names that stay hovered for 250 ms fetch).
- [ ] **Step 7: Footer credit.** Add "Text and pictures: <a>Wikipedia</a> (CC BY-SA 4.0)." to the app footer.
- [ ] **Step 8: Verify by eye:** Athens r5 cell, 500 to 300 BCE: events in year order with descriptions; Marathon expands to Wikipedia's paragraph; hovering a person shows a picture card; tabbing through names opens cards; a dot leg for a minor birth opens the box with that name highlighted; changing the range while open refreshes, and an empty range shows the plain line with the outline kept; clicking ocean shows "Nothing documented here for …"; no console errors.
- [ ] **Step 9: Run** the tests, typecheck, and lint. **Commit** as "Area box with Wikipedia paragraphs and hover cards".

### Task 9: Acceptance, decision record, gate

**Files:**
- Modify: `docs/decisions.md` (entry 29), `CLAUDE.md` (status line), `README.md` (attribution and `WIKIMEDIA_CONTACT` note), `.env.example` (note that summaries need `WIKIMEDIA_CONTACT`)

- [ ] **Step 1: Run the PLAN.md Phase 4 acceptance (a) to (g)** in the browser and note each result honestly, including failures. Sparse-cell example: a cell in the Sahel or the Amazon basin for the whole range.
- [ ] **Step 2: Write decision 29:** resolution bands as tuned, the benchmark numbers (before and after any index), the database size change, the grid fill colour check result, the stack look, and the `data/cache.db` deviation with its reason.
- [ ] **Step 3: Update** the CLAUDE.md status line to "Phase 4 complete, at the gate (date) …", plus the README and `.env.example`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** as "Log Phase 4 measurements and update status for the gate". Then STOP and report to the owner.
