# Phase 6 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark hexagon grid with a blank cream globe where any click reveals the historical region for the chosen years, keeping the twenty stories.

**Architecture:** Natural Earth provinces are the building block of every outline. `etl:load` fills `provinces` and `regions` tables and gives each event a `province_id`. `GET /api/area` takes a point and a range, chooses a region with a pure rule, merges its provinces by cancelling shared edges, and lists the events of the provinces that stay in the outline. Story text stays in committed files; `story:publish` computes each story's provinces and point from the database and stores them in `published.json`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, MapLibre GL 6, better-sqlite3, zod 4, vitest 5. `h3-js` is removed. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-phase-6-redesign-design.md`. Read it first; "spec 3.6" below means its section 3.6. Its numbers and copy win over any paraphrase here.

## Global Constraints

- No em dash (U+2014) or en dash (U+2013) in any prose, doc, comment, commit message, UI copy, or story. In code and tests write them as `\u2014` and `\u2013`. Scan with Node; `grep -P` fails on this shell's locale.
- No new dependencies. Fonts load through `next/font/google`.
- Scripts run on Node directly: `.ts` files, imports with explicit `.ts` extensions, no tsx.
- Years are signed historical integers (1 BCE = -1, no year 0); display text comes from `formatRange` / `formatYear`.
- Run `npm test`, `npm run typecheck` and `npm run lint` before every commit. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `.claude/`.
- A dev server runs only on port 3123. To stop it: find it with `Get-CimInstance Win32_Process` filtered on `portfolio projects\globe\node_modules`, run `taskkill /PID <pid> /T /F` on the next dev parent, and confirm none remain. Port checks and TaskStop are not reliable here. An orphan holds `data/chronoglobe.db` open and makes `etl:load` fail with EPERM.
- Never hardcode Wikidata QIDs from memory. Find items in the database by label.
- A story that fails a check is fixed in its text, never by loosening the checker or the allowlist. `lib/narrative/check.ts` and `allowlist.ts` do not change. `stories/inputs/` stays byte for byte.
- Raw downloads go in `data/raw/boundaries/<source>/` (gitignored) and are only ever parsed as data. Validate them with zod.
- Avoid backticks in double-quoted bash strings and regex escapes in `node -e`: write scripts to files.

## Review Focus

1. **A click at the antimeridian** (Chukchi Autonomous Okrug, Fiji, which Natural Earth cuts at 180 degrees): no line drawn along 180, and the camera frames the region rather than the whole world. Pinned in Task 2 (`boundaryLines`, `frameBounds`).
2. **A range crossing or sitting on the missing year 0** (Rome at 100 BCE to 100 CE, or -1 to 1, or both handles on one year): the midpoint and every animated date are never 0, and year counts skip it. Pinned in Task 3 (`midYear`, `yearCount`) and Task 10 (`tweenRange`).
3. **Dragging the slider before a click's answer arrives:** the late answer is dropped, so it cannot open a story or jump the range. Pinned in Task 9 (reducer).
4. **Clicking open water with an area selected:** the panel closes, the outline goes, and the stored point is cleared, so a later drag does not bring the old area back. Pinned in Task 7 (`kind: "none"`) and Task 9 (reducer).
5. **A cited item missing after a database rebuild, or a story province with nothing else in it:** nothing throws, the story hides with a `console.warn`, and `story:check` names the item. Pinned in Task 6 (`staleness`) and Task 7 (`queryArea`).

---

## File Structure

- `lib/geo/geometry.ts`: point in polygon, distance, ring area, bbox.
- `lib/geo/outline.ts`: edge cancelling, solid pieces, simplify, boundary lines, framing.
- `lib/outline/choose.ts`: the pure rule of spec 3.6, steps 2 to 4.
- `lib/outline/resolve.ts`: from a point and range to a selection, using the database.
- `lib/outline/scale.ts`: the scale line and atlas line copy.
- `lib/db/provinces.ts`, `lib/db/regions.ts`: reads for the two new tables.
- `lib/db/area.ts`: rewritten for a point.
- `lib/stories/catalog.ts`: `storyFor` by province and intent.
- `lib/narrative/`: `publish.ts` gains `placeStory`; `stale.ts` rewritten; `input.ts` keeps only `sourceText`.
- `lib/items.ts`: `what` and `itemMeta`, moved out of `lib/dots.ts`.
- `lib/labels.ts`: apparent zoom and label groups. `lib/selection.ts`: the client reducer and `tweenRange`.
- `etl/boundaries.ts` (fetch), `etl/boundaries-parse.ts` (pure parsing), `etl/struck-names.json`, `etl/bench-area.ts`.
- `app/ui/`: `GlobeApp`, `GlobeMap` and `RangeControl` rewritten, `AreaPanel` and `StoriesList` new, `AreaBox`, `FeaturedList` and `DotWeb` gone, `globe.module.css` rewritten.
- `docs/region-names.md`: generated for the owner's review.

---

### Task 1: Reword the fifteen count sentences

**Run by the main session**, which dispatches writers and reviewers directly (a subagent cannot). No code depends on this task.

**Files:**
- Modify: `stories/RULES.md`, the 15 stories in spec 4.3, `stories/published.json`, `tests/stories.test.ts`
- Add to this task's commit: this plan

- [ ] **Step 1: Write the failing guard.** In `tests/stories.test.ts` add `it("no sentence citing C contains a number")`: for every sentence with `"C"` in `cites`, assert no match for `/\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|twenty|thirty|forty|fifty|hundreds?|thousands?)\b/i`.
- [ ] **Step 2: Run** `npx vitest run tests/stories.test.ts`. Expected: FAIL, naming a sentence in `babylon`.
- [ ] **Step 3: Update `stories/RULES.md` to `rulesVersion: 3`.** Replace "When the box has few events, say so plainly, citing `C`. Never pad." with "Do not state how many events, people or places are documented here: the panel beside the story lists a wider region, so a count would contradict it. The numbers in `C` describe an earlier, smaller area; never repeat them. Never pad." In the JSON example replace the sentence "Only 3 events are documented here, so this account is short." with `<a sentence>`. In "The input", note that `entry.cell` is a historical record to ignore, and set the example's `rulesVersion` to 3.
- [ ] **Step 4: Rewrite each story through a fresh writer.** One fresh subagent per story in the spec 4.3 table, given only `stories/RULES.md`, `stories/inputs/<id>.json`, `stories/<id>.json`, the sentence's number, and the change the table names. It edits that sentence only and sets `rulesVersion` to 3 and `writtenAt` to today. "Keep placement only" is expected to read "Some locations in this account are approximate.", citing `C`. "Delete" removes the sentence. It runs `npx vitest run tests/stories.test.ts -t "passes the checker"` and fixes its own sentence if the checker fails.
- [ ] **Step 5: Confirm the blast radius.** Write a script in the scratchpad comparing each story with `git show 4913c6b:stories/<id>.json`. Expected: the 15 differ only in the listed sentence plus `rulesVersion` and `writtenAt`; `carthage`, `rome`, `constantinople`, `cusco` and `isandlwana` are byte-identical.
- [ ] **Step 6: Review each through a fresh reviewer.** One fresh subagent per story, given only the rules, the input, and the story, told which sentence changed. It judges that sentence: is every statement supported by its cited text? Fix findings through a writer and re-run the checker. Findings about other sentences are not edited; record them for the gate report.
- [ ] **Step 7: Publish and verify.** Run `npm run story:publish`, then `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass.
- [ ] **Step 8: Commit** the plan, rules, stories, published file and test: "Reword the fifteen story sentences that state local counts".

---

### Task 2: Geometry and outline functions

**Files:**
- Create: `lib/geo/geometry.ts`, `lib/geo/outline.ts`, `tests/geo.test.ts`

**Interfaces:**
- Produces, `geometry.ts`: `type Position = [number, number]` (lon, lat); `type Ring = Position[]`; `type AreaGeometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] }`; `polygonsOf(g: AreaGeometry): Ring[][]`; `pointInGeometry(lon: number, lat: number, g: AreaGeometry): boolean` (holes excluded); `distanceKm(a: Position, b: Position): number`; `ringAreaKm2(r: Ring): number`; `bboxOf(g: AreaGeometry): [west: number, south: number, east: number, north: number]`.
- Produces, `outline.ts`: `type OutlineInput = { id: string; geometry: AreaGeometry }`; `buildOutline(provinces: OutlineInput[], click: Position, exempt: ReadonlySet<string>): { rings: Ring[]; keptIds: string[]; areaKm2: number }`; `simplifyRing(r: Ring, toleranceDeg: number): Ring`; `boundaryLines(rings: Ring[]): Position[][]`; `frameBounds(rings: Ring[], clickLon: number): [number, number, number, number]`. Constants `MIN_PIECE_KM2 = 350`, `NEAR_PIECE_KM = 120`.

- [ ] **Step 1: Write the failing tests** in `tests/geo.test.ts`, using unit squares written inline:
  - `pointInGeometry`: inside true, outside false, inside a hole false, inside a MultiPolygon's second polygon true.
  - `distanceKm([0, 0], [0, 1])` within 1 km of 111.2. `ringAreaKm2` of a 1 degree square at the equator within 1% of 12,364.
  - `buildOutline` of two squares sharing an edge returns one closed ring with 6 distinct corners (the shared edge gone), whichever direction each square winds.
  - Two squares touching only at a corner return closed rings with no open chains.
  - A province with a hole: the outline has no hole ring, and `areaKm2` is the area of the outer ring, hole included, because that is the shape on screen.
  - An island 100 km away stays; an island 200 km away goes; an island of 100 km² goes unless the click is inside it; an island 200 km away stays when its province id is in `exempt`.
  - `keptIds` omits a province whose only piece was dropped, and keeps a surrounded province whose edges were all cancelled.
  - The clicked piece is the ring containing the click, or the nearest ring when the click is in no ring (a coastal click).
  - `simplifyRing` keeps first and last equal, and the corners of a square with a near-collinear extra vertex.
  - `boundaryLines` omits segments with both ends at longitude 180 or both at -180, splitting the ring there.
  - `frameBounds` for rings at longitudes 175 to 180 and -180 to -170 with `clickLon` 178 returns `west` 175 and `east` 190, not -180 to 180.
- [ ] **Step 2: Run** `npx vitest run tests/geo.test.ts`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement both files.** Key each edge by its two endpoints in sorted order and drop edges seen twice; walk what is left into rings, starting a new ring when the walk returns to a vertex on its path. A ring whose first vertex is inside a larger ring is a hole and is dropped. A province is kept if any of its edges is in a kept ring, or else if its first vertex is inside a kept ring. `simplifyRing` is iterative Douglas-Peucker (see `.superpowers/brainstorm/460-1793391168/src/ne-build.cjs`). Piece distance samples at most 80 vertices per ring, as the prototype's `ringGap` does.
- [ ] **Step 4: Check on real data.** Write a scratchpad script: `buildOutline` over all provinces of one large country from `data/raw/boundaries/naturalearth/` once Task 4 has fetched it, or from `C:\Users\14693\AppData\Local\Temp\claude\d--portfolio-projects-globe\c869a0bd-82d9-4ea9-a45a-548fe2462e12\scratchpad\ne-data\` now. Expected: no open chains, under 35 ms for about 123 provinces, including across a national border.
- [ ] **Step 5: Run tests, typecheck, lint.** Expected: pass.
- [ ] **Step 6: Commit:** "Add outline geometry: merging provinces by cancelling shared edges".

---

### Task 3: The rule that chooses a region

**Files:**
- Modify: `lib/time/index.ts`, `tests/time.test.ts`
- Create: `lib/outline/choose.ts`, `lib/outline/scale.ts`, `tests/outline-choose.test.ts`

**Interfaces:**
- Produces, `lib/time`: `yearCount(from: number, to: number): number` (inclusive, skips year 0); `midYear(from: number, to: number): number` (never 0).
- Produces, `choose.ts`: `type RegionRow = { id: number; source: "cliopatria" | "basemaps"; name: string; from_year: number; to_year: number; area: number }`; `MAX_SPAN_YEARS = 500`; `chooseRegion(rows: RegionRow[], from: number, to: number): RegionRow | null`. `rows` are those overlapping the range and already known to contain the point.
- Produces, `scale.ts`: `ATLAS_LINE = "A broad label from a historical atlas."`; `scaleLine(s: { kind: "historical" | "modern"; areaKm2: number; capped: boolean }): string`.

- [ ] **Step 1: Write the failing tests.**
  - `yearCount(-100, 100)` is 200, `yearCount(5, 5)` is 1, `yearCount(-1, 1)` is 2.
  - `midYear(-500, -300)` is -400; `midYear(-100, 100)` and `midYear(-1, 1)` and `midYear(-2, -1)` are not 0; `midYear(5, 5)` is 5.
  - Held wins: Cliopatria "Rome" rows -100 to -50 and -49 to 50, range -100 to 100, gives Rome even with a basemaps row present.
  - Exactly half passes: "A" at 1 to 50, range 1 to 100, gives A.
  - Short polity loses to basemaps: Cliopatria "Peloponnesian League" -404 to -384 and basemaps "Greek city-states" -450 to -350, range -500 to -300, gives Greek city-states.
  - Same years are not counted twice: two "A" rows at 1 to 50, range 1 to 150, plus a basemaps row covering the midpoint, gives the basemaps row.
  - Step 4: short Cliopatria "A" containing the midpoint and no basemaps row gives A; of two there, the smaller `area` wins; one that misses the midpoint gives null.
  - A basemaps row that does not contain the midpoint is ignored.
  - The returned Cliopatria row is the one of that name nearest the midpoint.
  - `scaleLine({ kind: "historical", areaKm2: 130499, capped: false })` is "about 130,000 km², approximate, built from modern provinces"; capped adds ", within 800 km"; `{ kind: "modern", areaKm2: 879, capped: true }` is "about 880 km², modern borders, within 800 km".
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.** `midYear` and `yearCount` go through `historicalToAstronomical`, so year 0 cannot appear. Held years for a name are the union of its rows' intervals clipped to the range. Round the area to two significant figures.
- [ ] **Step 4: Run tests, typecheck, lint.** Expected: pass.
- [ ] **Step 5: Commit:** "Add the rule that chooses a region for a click and a range".

---

### Task 4: Load provinces and regions

**Files:**
- Create: `etl/boundaries.ts`, `etl/boundaries-parse.ts`, `etl/struck-names.json` (`[]`), `tests/boundaries.test.ts`, `tests/fixtures/boundaries/{naturalearth,cliopatria,basemaps}.json`, `docs/region-names.md` (generated)
- Modify: `lib/db/schema.ts`, `etl/load.ts`, `tests/load.test.ts`, `tests/helpers.ts`, `package.json`

**Interfaces:**
- Consumes: `lib/geo/*`, `RegionRow`.
- Produces, schema additions (the `h3_*` columns stay until Task 6):
  - `provinces(id TEXT PRIMARY KEY, name TEXT, country TEXT, lon REAL, lat REAL, west REAL, south REAL, east REAL, north REAL, area REAL, geojson TEXT)`
  - `regions(id INTEGER PRIMARY KEY, source TEXT, name TEXT, from_year INTEGER, to_year INTEGER, area REAL, wikidata TEXT, west REAL, south REAL, east REAL, north REAL, geojson TEXT)`, with an index on `(from_year, to_year)`
  - `events.province_id TEXT`, with `idx_events_province ON events(province_id, kind, sitelinks DESC)`
- Produces, parsing: `parseProvinces(fc: unknown): ProvinceRow[]`; `parseCliopatria(fc: unknown): NewRegion[]`; `parseBasemaps(fc: unknown, snapshot: { from: number; to: number }): NewRegion[]`; `applyStrikes(rows: NewRegion[], struck: ReadonlySet<string>): NewRegion[]` (basemaps rows only); `type NewRegion = Omit<RegionRow, "id"> & { wikidata: string | null; west: number; south: number; east: number; north: number; geojson: string }`; `snapshotRanges(years: number[]): { year: number; from: number; to: number }[]`; `nearestProvince(p: readonly ProvinceRow[], lon: number, lat: number, maxKm: number): ProvinceRow | null`; `unzipEntry(zip: Buffer, suffix: string): Buffer`; `regionNamesDoc(rows: NewRegion[], struck: ReadonlySet<string>): string`.
- Produces: `writeDatabase(path, rows, info, geo: { provinces: ProvinceRow[]; regions: NewRegion[] } = { provinces: [], regions: [] })`; `tests/helpers.ts` gains `makeGeoDb(rows, provinces, regions)`.

Data facts, measured: Cliopatria properties are `Name, FromYear, ToYear, Area, Type, Wikidata`; 13,797 rows, 385 of them `Type: "RELATION"`, 1,733 with names starting "(", 6 touching year 0. Its README says negative years are BCE, so its years are already historical apart from that 0. Basemaps features use `NAME`, which can be null or blank. Natural Earth properties include `adm1_code` (all 4,596 distinct), `name`, `admin`, `latitude`, `longitude`; use those last two as the representative point. Its `area_sqkm` is 0, so compute area with `ringAreaKm2`.

- [ ] **Step 1: Pin the sources and save fixtures.** Resolve the current commit of each repo (`git ls-remote`) and record it in `etl/boundaries.ts`: `nvkelso/natural-earth-vector` (`geojson/ne_10m_admin_1_states_provinces.geojson`), `Seshat-Global-History-Databank/cliopatria` (`cliopatria.geojson.zip`), `aourednik/historical-basemaps` (`geojson/world_*.geojson`). Save a tiny fixture per source with real properties and hand-shrunk geometry, including one `RELATION` row, one parenthesised name, one year 0 row, and one null `NAME`.
- [ ] **Step 2: Write the failing tests** in `tests/boundaries.test.ts`:
  - `parseCliopatria` drops `RELATION` rows and parenthesised names, and maps `FromYear: 0` to 1 and `ToYear: 0` to -1.
  - `parseBasemaps` drops null and blank `NAME` and trims names. `applyStrikes` drops a struck basemaps name and leaves a Cliopatria row of the same name.
  - `snapshotRanges([-3000, -2000, -1, 100])`: first `from` is `MIN_YEAR`, last `to` is `MAX_YEAR`, ranges touch with no gap or overlap, none contains 0. A snapshot older than `MIN_YEAR` passed in is dropped.
  - `parseProvinces` rejects a feature without `adm1_code` (zod).
  - `nearestProvince` returns the containing province, else the nearest within `maxKm`, else null.
  - `unzipEntry` round-trips a zip built in the test with `deflateRawSync`, read through the central directory.
  - `regionNamesDoc` lists the larger total area first, shows years, and marks struck names.
  - In `tests/load.test.ts`: an event inside a province gets its id; one 100 km offshore gets the nearest; one 500 km offshore stays null.
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** `etl/boundaries.ts` skips files already on disk and pauses between requests. Add the `etl:boundaries` script and put it in `etl`, between fetch and load. `etl/load.ts` reads the raw files, assigns each event with `nearestProvince(..., SNAP_KM)`, `SNAP_KM = 150`, writes `docs/region-names.md` from all rows, then inserts the rows `applyStrikes` leaves. It fails with a message pointing at `etl:boundaries` if the files are missing. Keep the temp-file-then-rename pattern.
- [ ] **Step 5: Run the real load:** `npm run etl:boundaries && npm run etl:load`, with no dev server running. Expected output, which goes in the gate report: database size in MB; province and region counts; events inside a province, snapped, and unassigned; distinct basemaps names; the province of "Battle of Salamis" (found by label), which should be Attiki or its neighbour. Look at what the 150 km snap catches and change `SNAP_KM` if it pulls in the wrong places.
- [ ] **Step 6: Run tests, typecheck, lint.** Expected: pass.
- [ ] **Step 7: Commit:** "Load provinces and historical regions, and place events in provinces".

---

### Task 5: Remove the grid, dots and hover web from the app

The globe is plain and unclickable after this task. It stays that way until Task 9.

**Files:**
- Delete: `app/api/cells/`, `app/api/events/`, `app/ui/DotWeb.tsx`, `app/ui/AreaBox.tsx`, `app/ui/FeaturedList.tsx`, `lib/dots.ts`, `lib/web.ts`, `lib/db/cells.ts`, `lib/db/events.ts`, `etl/bench-cells.ts`, `etl/bench-events.ts`, `tests/dots.test.ts`, `tests/web.test.ts`, `tests/cells-query.test.ts`, `tests/events.test.ts`
- Create: `lib/items.ts`
- Modify: `app/ui/GlobeApp.tsx`, `app/ui/GlobeMap.tsx`, `app/ui/HoverCard.tsx`, `lib/db/area.ts`, `lib/box.ts`, `tests/box.test.ts`, `package.json`

**Interfaces:**
- Produces: `what(d: Pick<AreaItem, "kind" | "category">): string` and `itemMeta(p: { years: string; what: string; approx: boolean }): string` in `lib/items.ts`, same bodies as `what` and `dotMeta`.
- Produces: `GlobeMap({ styleUrl })`, a minimal map: the existing worker URL line, globe projection, compact attribution. No NavigationControl (spec 3.1 lists everything on screen).
- Keep for Task 6: `lib/cells.ts`, `lib/db/area.ts` and `app/api/area/route.ts` (`story-input` and `stale` still use them). Move the `year` validator from `lib/db/events.ts` into `lib/db/area.ts`.

- [ ] **Step 1: Delete and move.** Do the deletions, move `what` and `dotMeta`, and point `HoverCard` and `tests/box.test.ts` at `lib/items.ts`. Remove `panToClear` and its test, and the `bench:events` and `bench:cells` scripts. Reduce `GlobeApp` to `GlobeMap`, `RangeControl` and the caption.
- [ ] **Step 2: Run tests, typecheck, lint.** Expected: pass. Trust the compiler to find the rest; there should be no reference to `/api/cells` or `/api/events` in `app/`.
- [ ] **Step 3: Commit:** "Remove the dots, stacks, hover web and cell APIs".

---

### Task 6: Stories without cells, and remove h3-js

**Files:**
- Delete: `etl/story-input.ts`, `lib/cells.ts`, `app/api/area/route.ts`, `tests/cells.test.ts`, `tests/area.test.ts`
- Modify: `lib/narrative/types.ts`, `input.ts`, `publish.ts`, `stale.ts`; `etl/story-publish.ts`, `etl/story-check.ts`; `stories/featured.json`, `stories/published.json`; `lib/stories/catalog.ts`; `lib/db/schema.ts`, `etl/load.ts`, `lib/db/area.ts`; `tests/narrative-input.test.ts`, `narrative-publish.test.ts`, `narrative-stale.test.ts`, `catalog.test.ts`, `stories.test.ts`, `load.test.ts`, `helpers.ts`; `package.json`

**Interfaces:**
- Produces, `types.ts`: `FeaturedEntrySchema` is `{ id, place, from, to }`. `FrozenEntrySchema` extends it with `cell: z.string()`, and `StoryInputSchema.entry` uses it. No import of `lib/cells`.
- Produces, `publish.ts`: `type Placement = { point: Position; provinces: string[] }`; `type CitedRow = { qid: string; lat: number; lon: number; sitelinks: number; province_id: string | null }`; `placeStory(cited: CitedRow[]): Placement`; `publishStories(featured, stories, inputs, placements: ReadonlyMap<string, Placement>): PublishedStory[]`. `PublishedStory` gains `point` and `provinces`.
- Produces, `stale.ts`: `staleness(published: PublishedStory, input: StoryInput, rows: ReadonlyMap<string, CitedNow>): { stale: string[]; outOfDate: string[]; warnings: string[] }` with `type CitedNow = CitedRow & Pick<AreaItem, "label" | "start_year" | "end_year" | "loc_confidence">`.
- Produces, `catalog.ts`: `type Intent = "click" | "range"`; `storyFor(provinceId: string, from: number, to: number, intent: Intent, stories = PUBLISHED): PublishedStory | null`; `FEATURED` as today; `missingCites(story: PublishedStory, area: { events: AreaItem[]; others: AreaItem[] }): string[]`.
- `lib/db/area.ts` shrinks to the `AreaItem` type and the `year` validator; Task 7 rewrites it. Nothing in the UI calls `/api/area` between Tasks 5 and 9.

- [ ] **Step 1: Write the failing tests.**
  - `placeStory`: picks the province holding the most cited items, then the most notable cited item in it (ties: lower code, lower qid); `provinces` holds each distinct `province_id`, sorted; throws, naming the qid, when a `province_id` is null.
  - `publishStories`: throws when a placement is missing; carries `point` and `provinces` through; compares id, from and to with the input, and no longer `cell`.
  - `staleness`: a missing qid, a changed label, changed years text, or a null province are each stale. A `point` or `provinces` differing from `placeStory` is `outOfDate`. A changed location confidence is a warning only. A sentence citing only `C` adds nothing. It takes no area and no top list, and reports no drift.
  - `storyFor`, with Athens at -500 to -300 in `["A"]`, Babylon at -2500 to -500 in `["B", "C", "D"]`, Baghdad at 750 to 1260 in `["C", "D"]`: `("A", -450, -350, "click")` is Athens; `("A", 1000, 1100, "click")` is null; `("A", -3500, 2026, "click")` is Athens (half the story's years); `("A", -400, -200, "click")` is Athens (half the chosen range); `("A", -310, 1000, "click")` is null; `("A", -500, -300, "range")` is Athens; `("A", -500, -299, "range")` and `("A", -450, -350, "range")` are null; `("C", -3500, 2026, "click")` is Baghdad (smaller set); `("Z", -500, -300, "range")` is null.
  - `tests/stories.test.ts`: builds placements from `published.json`, compares as today, and asserts each story's `provinces` is non-empty and its `point` is two finite numbers. Frozen inputs still parse, `cell` included.
  - `tests/load.test.ts`: the schema has no column starting `h3_`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `cell` from `stories/featured.json`. Reduce `lib/narrative/input.ts` to `sourceText`. Delete `etl/story-input.ts` and the `story:input` script. Overlap in `storyFor` counts with `yearCount`. `etl/story-publish.ts` opens the database read-only, reads the cited rows, calls `placeStory`, and fails with the message from Step 1. `etl/story-check.ts` follows spec 5.5: exit 1 on stale or out of date, and print which. Drop the `h3_*` columns and all their indexes, plus `idx_events_kind_rank` (it served only `/api/events`), `cellsForPoint`, and `makeDb`'s cell fields. Run `npm uninstall h3-js`.
- [ ] **Step 4: Rebuild and publish:** `npm run etl:load`, `npm run story:publish`, `npm run story:check`. Expected: "No stale stories", all twenty placed. Compare every story's provinces with the spec 4.2 table: Athens is `Attiki`, Jerusalem has five, Kyoto has `Kyōto` and `Shiga`. Check that points land on the place. Investigate any difference.
- [ ] **Step 5: Run tests, typecheck, lint.** Expected: pass; nothing in `package.json`, `lib`, `app`, `etl` or `tests` mentions `h3`.
- [ ] **Step 6: Commit:** "Place stories by province and remove h3-js".

---

### Task 7: The new area API

**Files:**
- Create: `lib/db/provinces.ts`, `lib/db/regions.ts`, `lib/outline/resolve.ts`, `etl/bench-area.ts`, `tests/resolve.test.ts`
- Rewrite: `lib/db/area.ts`
- Create: `app/api/area/route.ts`, `tests/area.test.ts` (Task 6 deleted both)
- Modify: `lib/box.ts`, `tests/box.test.ts`, `package.json`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 6.
- Produces, `lib/db/provinces.ts`: `provinceIndex(db)`, held per database in a `WeakMap`, with no geometry in memory; `provinceAt(db, lon, lat, maxKm = 50): ProvinceRow | null`; `provinceGeometry(db, id): AreaGeometry`.
- Produces, `lib/db/regions.ts`: `regionsContaining(db, lon, lat, from, to): RegionRow[]`, a bbox and year query then `pointInGeometry`; `regionShapes(db, row: RegionRow): AreaGeometry[]`, which for basemaps is all features of that name and snapshot and for Cliopatria is that row.
- Produces, `resolve.ts`: `CAP_KM = 800`; `type Selection = { kind: "historical" | "modern"; name: string; source: "cliopatria" | "basemaps" | null; areaKm2: number; capped: boolean; provinceIds: string[]; fill: { type: "MultiPolygon"; coordinates: Ring[][] }; lines: { type: "MultiLineString"; coordinates: Position[][] }; bounds: [number, number, number, number] }`; `resolveOutline(db, q: { lon: number; lat: number; from: number; to: number; clicked: ProvinceRow; story: PublishedStory | null }): Selection`.
- Produces, `area.ts`: `AreaQuery`, zod: `lat`, `lon`, `from`, `to`, `intent` (`click | range`), `eventsLimit` (default 25), `othersLimit` (default 30). `from <= to`, years valid, as today. `queryArea(db, q, stories = PUBLISHED): AreaAnswer`, where `AreaAnswer = { selection: Selection | { kind: "none" }; storyId: string | null; from: number; to: number; events: AreaItem[]; eventsTotal: number; others: AreaItem[]; othersTotal: number }`.
- Produces, `box.ts`: `areaUrl(q: { lat; lon; from; to; intent; eventsLimit; othersLimit }): string`.

- [ ] **Step 1: Write the failing tests** on `makeGeoDb` with square provinces, keeping the qids and names synthetic:
  - Rule order: a Cliopatria region held for the range wins; a short polity loses to a basemaps region; basemaps gathers all pieces of its name in that snapshot; no region gives `modern`, named for the country.
  - Range over `MAX_SPAN_YEARS` gives `modern`, unless a story is showing: then the region for the story's own years.
  - A miss at the click retries at the clicked province's representative point before going modern.
  - The clicked province is always in `provinceIds`. A province whose representative point is within 800 km and in the region is added. One at 900 km is not, and `capped` is true. `capped` is false when nothing was cut.
  - A story's province stays even when over 800 km away and when its piece is far from the clicked piece.
  - `queryArea`: a click 40 km offshore counts as the nearest province. A click 60 km offshore returns `{ kind: "none" }`, empty lists, and no throw.
  - `intent: "click"` in a story's province at an overlapping range returns `storyId` and `from` and `to` moved to the story's. `intent: "range"` at the same range returns no story and leaves the range alone. `intent: "range"` at the exact years returns the story.
  - Lists hold only items in `provinceIds` overlapping the range. Limits apply, and totals are the full counts. Sort order as today.
  - A cited item outside the top N is appended without duplicating; a cited qid absent from the database is simply absent; an item with a null `province_id` is never listed.
  - Bad query (year 0, `from > to`, lat 91, unknown intent) is rejected by `AreaQuery`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `queryArea` runs in this order: `provinceAt`; `storyFor` with the given `stories`; if there is a story, use its exact years; `resolveOutline`; lists by `province_id IN (...)`. Simplify after merging, picking the tolerance from the bounds so the payload stays small. `route.ts` keeps the `Server-Timing` header.
- [ ] **Step 4: Write `etl/bench-area.ts`** (`npm run bench:area`): at least 40 fixed clicks spread across continents and eras, including wide ranges in Europe and every story's point and years. It prints each result's name, kind, ms and payload KB; p50 and max ms; and fails if any outline has an open ring, a named region has an empty name, or a listed item's province is not in `provinceIds`. It also prints the outline name for all twenty stories.
- [ ] **Step 5: Run it.** Expected: max under 150 ms, payload around 200 KB or less, and twenty names matching the spec 4.2 table. If the wide-range case misses 150 ms or the database from Task 4 is over about 400 MB, simplify `regions` geometry at load (they are only used for containment, so about 0.02 degrees is safe) and reload; only then consider an R*Tree. Report the before and after. Any name differing from the table goes in the gate report.
- [ ] **Step 6: Run tests, typecheck, lint.** Expected: pass.
- [ ] **Step 7: Commit:** "Answer the area API from a point, with outline and story".

---

### Task 8: The cream look and names by zoom

**Files:**
- Create: `lib/labels.ts`, `tests/labels.test.ts`
- Modify: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/ui/GlobeMap.tsx`, `app/ui/GlobeApp.tsx`, `app/ui/globe.module.css`, `.env.example`

**Interfaces:**
- Produces: `apparentZoom(zoom: number, lat: number): number` (spec 3.3 formula); `LABEL_GROUPS: { at: number; layers: string[] }[]`; `labelGroupOn(wasOn: boolean, apparent: number, at: number): boolean` with a dead band of 0.08; `FADE_MS = 320`.

Values, all from spec 3.2 and 3.3 and the prototype (`.superpowers/brainstorm/460-1793391168/src/look-v8.template.html`, lines 116 to 163). Groups: 3.15 `label_country_1, _2, _3`; 3.9 `water_name_point_label, water_name_line_label`; 5.2 `label_city_capital`; 6.0 `label_city, label_state`; 8.0 `label_town`; 10.5 `label_village`; 12.0 `label_other, waterway_line_label`.

- [ ] **Step 1: Write the failing tests:** `apparentZoom(3.35, 0)` is 3.35 and `apparentZoom(2.02, 66.55)` is within 0.02 of it, the measured drag from spec 3.3; it stays finite at latitude 90; `labelGroupOn(false, 3.2, 3.15)` is false and `(false, 3.24, 3.15)` true; `(true, 3.1, 3.15)` true and `(true, 3.06, 3.15)` false. `LABEL_GROUPS` matches the table above.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the look.** Fraunces and Newsreader through `next/font/google` in `layout.tsx`, exposed as CSS variables. Palette variables in `globals.css` from spec 3.2. Rewrite `globe.module.css` for what remains, removing all dark styling; thin rules, no rounded cards. Default style URL `https://tiles.openfreemap.org/styles/positron`, `BASEMAP_STYLE_URL` still overrides; update the `.env.example` comments, which mention dots. Recolour on `style.load` as the prototype does. The camera opens on the whole globe (zoom about 1.75); page load fades it in; no auto-spin.
- [ ] **Step 4: Implement names by zoom** in `GlobeMap`: `setLayerZoomRange(id, 0, 24)` on every group layer, a `text-opacity-transition` of `FADE_MS`, and on `move` compare and fade, setting `visibility: none` after the fade. Guard with `map.getLayer` so a custom `BASEMAP_STYLE_URL` cannot throw.
- [ ] **Step 5: Add the footer credits.** A quiet `details` element reading "Sources" that opens all credits from spec 7 and the existing ones: Cliopatria (CC BY 4.0, link to the license, note that shapes are processed), historical-basemaps (GPL-3.0), Natural Earth (public domain), Wikidata (CC0), Wikipedia (CC BY-SA 4.0), OpenFreeMap, OpenMapTiles, OpenStreetMap.
- [ ] **Step 6: Check in a browser** on port 3123: cream globe, no names at opening zoom, and all countries appear together. Drag from Africa to Europe at one apparent zoom, with a real drag: country names stay on. No console errors. Stop the server as Global Constraints say.
- [ ] **Step 7: Run tests, typecheck, lint.** Expected: pass.
- [ ] **Step 8: Commit:** "Give the globe its cream look and names by apparent zoom".

---

### Task 9: Clicking: outline, panel and camera

**Files:**
- Create: `lib/selection.ts`, `tests/selection.test.ts`, `app/ui/AreaPanel.tsx`
- Modify: `app/ui/GlobeApp.tsx`, `app/ui/GlobeMap.tsx`, `app/ui/globe.module.css`

**Interfaces:**
- Consumes: `queryArea`'s `AreaAnswer`, `areaUrl`, `storyFor`, `missingCites`, `scaleLine`, `ATLAS_LINE`.
- Produces, `selection.ts`: `type AreaState = { point: Position | null; range: YearRange; intent: Intent; eventsLimit: number; othersLimit: number; answer: { url: string; body: AreaAnswer | null } | null }`; `initialArea: AreaState` with range -500 to -300; `areaReducer(s: AreaState, a: AreaAction): AreaState` with actions `click(point)`, `choose(point, range)`, `drag(range)`, `more(list, next)`, `close`, `answered(url, body)`; `requestUrl(s: AreaState): string | null`.
- Produces: `GlobeMap({ styleUrl, outline, panelOpen, onClick })`, where `outline` is `{ fill; lines; bounds; fly: boolean; key: string } | null`.

- [ ] **Step 1: Write the failing reducer tests:**
  - `click` stores the point, sets intent `click`, resets limits, and keeps the old answer out of view (`requestUrl` differs from `answer.url`).
  - `answered` with a url other than `requestUrl(s)` changes nothing: a click, then a `drag`, then the click's late answer leaves the range as dragged and no story.
  - `answered` with moved `from` and `to` updates the range, sets intent `range`, and stores the answer under the new `requestUrl`, so no second fetch fires.
  - `drag` sets intent `range`, and keeps the point.
  - `answered` with `selection.kind === "none"` clears the point and answer; a later `drag` gives `requestUrl` null.
  - `choose` sets point, exact range and intent `range`.
  - `more` keeps the base so the list stays on screen while loading.
  - `close` clears point and answer, keeps the range.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the reducer and wire `GlobeApp`:** `useReducer`, plus one effect that fetches `requestUrl` debounced 120 ms and aborts on change, skipping the fetch when `answer.url` already matches. An error sets `body: null`, and the panel shows "Could not load this area."
- [ ] **Step 4: Write `AreaPanel`.** Start from `git show 4913c6b:app/ui/AreaBox.tsx` and keep `EventRow`, `More`, keyboard focus after "show more", Escape, citation scrolling, and the footer line. Remove the fetch, the cell header, and the category colours; a small filled mark for exact and hollow for inherited stays, with "approximate location" text. Order per spec 3.5: name, atlas line (source `basemaps` only), years, `scaleLine`, the story under its place name, Events, People and places. Empty copy: "Nothing documented here for these years." The guard stays: when `missingCites` is non-empty, hide the story and `console.warn`. Width `min(420px, 36vw)`. The panel is always mounted and slides over the map, with `aria-hidden` when closed. Open water closes it (the spec's builder's call, resolved: "Open water" would be wrong for a far-off answer, and silence is honest).
- [ ] **Step 5: Implement map behaviour in `GlobeMap`,** using the prototype's constants (look-v8 lines 165 to 168, 208 to 238): `sel-fill`, `sel-case` and `sel-line` layers, fill from `outline.fill`, lines from `outline.lines`. On click, wrap the longitude and call `onClick`, and ease `padding.right` to the panel's width over 460 ms. On a new selection's answer, `flyTo` the `bounds` with padding (`right` panel, `bottom` 184) over about 1500 ms, clamping zoom between 1.9 and 6.2, then fade the outline in over 500 ms on `moveend`; a newer selection cancels the wait. On a range answer, no camera move, just `setData`. Closing eases padding to zero and clears the outline. Use `padding`, not `offset` (spec 5.6). `prefers-reduced-motion` makes durations 0.
- [ ] **Step 6: Check in a browser:** click Attica at 500 to 300 BCE: story, "Greek city-states", atlas line, scale line, and every citation marker scrolls to a listed row. Click Thessaly: outline and lists, no story. Click in Chukotka and in Fiji: no line along 180, sensible framing. Click open water: panel closes. No console errors.
- [ ] **Step 7: Run tests, typecheck, lint.** Expected: pass.
- [ ] **Step 8: Commit:** "Reveal an outline and open the reading column on a click".

---

### Task 10: Dates, Stories list and remaining motion

**Files:**
- Create: `app/ui/StoriesList.tsx`
- Rewrite: `app/ui/RangeControl.tsx`
- Modify: `lib/selection.ts`, `tests/selection.test.ts`, `app/ui/GlobeApp.tsx`, `app/ui/AreaPanel.tsx`, `app/ui/globe.module.css`

**Interfaces:**
- Produces: `tweenRange(a: YearRange, b: YearRange, t: number): YearRange` in `lib/selection.ts`, interpolating in astronomical years and never returning 0; `TWEEN_MS = 620`.
- Produces: `STORIES: readonly PublishedStory[]` in `catalog.ts`, sorted as `FEATURED` is, which replaces `FEATURED`; `StoriesList` reads `entry` and `point` from it.
- Consumes: `choose(point, range)`.

- [ ] **Step 1: Write the failing test:** `tweenRange` at t 0 is `a` and at t 1 is `b`; for -100 to 100 at every t in steps of 0.01 neither end is 0; ends are integers.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Rewrite `RangeControl`.** Keep the two native inputs and their keyboard behaviour; remove the presets and the "Years" label. Dates set large in Fraunces, centred over the slider at bottom centre, with the coverage caption of spec 3.1 as one quiet line beneath. When a story or list entry sets the range, a `requestAnimationFrame` tween moves numbers and input values together (`TWEEN_MS`, ease-out cubic); dragging skips the tween and calls `drag`. The animated numbers are `aria-hidden`; a visually hidden `output aria-live="polite"` holds the final text, so a screen reader hears one value.
- [ ] **Step 4: Write `StoriesList`:** a "Stories" button by the wordmark "CHRONOGLOBE" with `aria-expanded`, opening a short smooth list ordered by start year, entries "Athens, 500 BCE to 300 BCE", plus the note from featured-stories spec 4.1. Choosing dispatches `choose`, closes the list, and gives the panel focus. Works by keyboard.
- [ ] **Step 5: Finish the motion in spec 3.4:** panel text crossfades on switching areas; citation clicks scroll smoothly and flash the row; everything instant under `prefers-reduced-motion`.
- [ ] **Step 6: Check in a browser:** every one of the twenty entries opens its own story at its exact years, with the outline name in the spec 4.2 table. Drag away: story hides. Choosing an entry whose years the slider cannot reach still shows the exact years. Drag past 500 years with a non-story selection: "modern borders". Reduced motion: all instant.
- [ ] **Step 7: Run tests, typecheck, lint.** Expected: pass.
- [ ] **Step 8: Commit:** "Animate the dates and add the Stories list".

---

### Task 11: Docs

**Files:**
- Modify: `CLAUDE.md`, `docs/PLAN.md`, `docs/decisions.md`, `README.md`, `.env.example`, `docs/superpowers/specs/2026-10-29-featured-stories-design.md`

- [ ] **Step 1: Update `CLAUDE.md`** per spec 7: opening paragraph, key decision 3 superseded, non-goals (historical borders out, the warning stays), emptiness risk, stack, repo layout, schema block, licensing. The status line waits for Task 12.
- [ ] **Step 2: Update `docs/PLAN.md`:** Phase 6 becomes a pointer to the spec; play button and heat layer recorded as dropped by the owner; definition of done updated (section 6 names "that cell").
- [ ] **Step 3: Add entry 32 to `docs/decisions.md`:** the reasons, the measurements in the spec, the dataset comparison, Cliopatria alone recommended then overturned by measurement, the midpoint test replaced by the held test with the Athens, Lhasa and Beijing evidence, the stored point rule and why the cell centre failed, the `h3` and story-input removal, and that a 21st story needs a new input generator. Add the measured database size and click timings from Tasks 4 and 7.
- [ ] **Step 4: Update `README.md`** (status, ETL steps including `etl:boundaries`, `story:publish` and `story:check` after `etl:load`, removal of `/api/events` and `lib/dots.ts` lines, sources, attributions) and add notes at 4.2, 6.2 and 6.7 of the featured-stories spec pointing to the new one.
- [ ] **Step 5: Scan for dashes** with a Node script over `docs`, `stories` (excluding inputs), `app`, `lib`, `etl`, `tests`, and `README.md`. Expected: none outside frozen source text and generated source names in `docs/region-names.md`.
- [ ] **Step 6: Commit:** "Document the redesign".

---

### Task 12: Acceptance and the phase gate

**Run by the main session.** Nothing merges. Stop here.

- [ ] **Step 1: Run the checks:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run story:check`, `npm run bench:area`. Expected: all pass. Record the numbers.
- [ ] **Step 2: Walk spec section 6, items 1 to 14, in a real browser** on port 3123, with real mouse and keyboard, and at least 30 clicks across eras and continents for item 5. Check the console. Note what could not be judged headlessly (motion feel is the owner's; item 6 says so).
- [ ] **Step 3: Stop the dev server** and confirm no process remains.
- [ ] **Step 4: Update the status line in `CLAUDE.md`** to say Phase 6 is built and awaiting the owner's approval, and commit.
- [ ] **Step 5: Report to the owner and STOP.** The report holds: acceptance results item by item, including failures and uncertainty; each reworded sentence, before and after, for their read; reviewer findings, including those about untouched sentences; database size and click timings; events unassigned to a province and what the snap caught; `docs/region-names.md` for their strike pass (item 12 cannot pass without them), and how to apply strikes (`etl/struck-names.json`, then `npm run etl:load`, `story:publish`, `story:check`); any outline name that differs from the spec 4.2 table; and every ruling made during the build. Merging waits for their approval.
