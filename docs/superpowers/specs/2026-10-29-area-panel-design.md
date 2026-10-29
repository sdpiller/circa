# Area panel and grid view: design (Phases 4 and 5, revised)

Date: 2026-10-29. Status: ready for owner review (builder check done, owner's answers folded in). Replaces the Phase 4 text in `docs/PLAN.md` and changes how Phase 5's narrative is shown. Read `CLAUDE.md` and `docs/decisions.md` (entries 18, 25 to 27) first; their conventions still hold unless this document says otherwise.

## 1. Intent

The owner reshaped how people explore the globe. Before: dots everywhere, click anywhere, the app guesses an area. Now: the globe starts plain, a grid of cells fades in as you zoom, and each drawn cell is a stretch of land that has documented history in the chosen year range. Clicking a cell opens a box: a short grounded story at the top, then the events, then the people and places.

Why this is better than the old plan: the area you clicked is the area you see outlined, so "what does near here mean" has a visible answer, and empty land is visibly empty instead of being discovered by a failed click. The grid is also an honest coverage map, which supports the bias caption.

The story stays the product (CLAUDE.md). The owner briefly cut it, then restored it, now at the top of the box.

## 2. What the user sees

### 2.1 The globe

- **Start:** a plain globe at the current start zoom (1.6). No dots, no grid. A small hint ("Zoom in to explore") tells a stranger what to do. *Builder's call: wording and placement.*
- **Grid:** from about zoom 3 (continent scale, *my call, tune by eye*), H3 hexagons fade in. Only cells holding at least one item (any kind) in the selected range are drawn. Cells get finer as you zoom (resolution chosen from zoom, see 3.2). Changing the range redraws the grid.
- **Shading:** a cell's emphasis grows with its number of events (kinds `event` and `discovery`), so cells holding only people and places look faint and cells rich in events stand out. *My call.* Outline plus a low-opacity fill. Constraint: dot colours were validated against the bare basemap only (decision 26). Either keep the grid fill so faint that the background under dots is effectively unchanged, or re-run the dataviz colour check against the filled colour. Do not ship an unvalidated combination.
- **Dots toggle:** dots are off by default; a toggle turns on the existing Phase 3 dot layer (per-kind quotas, colours, hollow for inherited) drawn above the grid. Even with the toggle on, dots only appear from the same zoom as the grid; from orbit the globe is always plain (owner decided). The legend's dot section only shows while dots are visible. The Phase 3 globe band (zoom 0 to 3) of the events API becomes unused by the client; leave it in place.
- **Clicking a cell** highlights its outline and opens the box. **Clicking where no cell is drawn** shows one plain line: "Nothing documented here for 500 to 300 BCE." No widening ladder (see 4.3).
- **Zoom limits:** the map zooms as far as the basemap provider allows, but the grid stops refining at r5 (cells about 17 km across, owner decided: "grid areas are locked to their size"). Past that zoom, cells simply grow on screen. Reason: 42% of events and all births borrow the coordinates of a city or region, so finer cells would pile them into one downtown cell and claim more precision than the data has.

### 2.1b Dots, stacks, and the web (owner's sketch)

- **Stacks:** dots that would overlap on screen merge into one stack dot. Overlap, not identical coordinates, is the test, because overlapping dots are equally unclickable. MapLibre's built-in GeoJSON clustering with a small `clusterRadius` (about one dot diameter) is the intended mechanism, with `getClusterLeaves` for the members; no new dependency. The stack dot looks distinct from a single dot (slightly larger, with a small count). Its colour must stay within the validated palette of decision 26. *Builder's call: exact look.*
- **The web:** hovering a stack dot fans its members out radially around it, each joined to the centre by a thin line, like a spider web or a star (owner's sketch: a centre dot with about 9 legs). The fan-out animates (legs grow out from the centre, about 200 to 300 ms; *builder's call*). Each leg ends in a normal dot in its usual colour and style; hovering a leg dot shows its name (as the Phase 3 tooltip does); clicking it opens the box for the cell containing it, scrolled to that item and highlighted. The web stays open while the pointer is over the centre, a leg, or the space between them, and closes shortly after the pointer leaves. Clicking the centre opens the cell box.
- **Large stacks:** at most 8 member legs in a ring, ordered by sitelinks, plus a ninth "+N more" leg that opens the cell box. *My call: a web with 40 legs is unreadable, and every "born in Athens" person shares one point.*
- **Single dots:** clicking opens the box for the dot's cell with that item highlighted (owner decided).

### 2.2 The box

**When the range changes while the box is open,** the box stays on the same cell and refreshes for the new range; an in-flight request or story for the old range is cancelled. If the cell has nothing in the new range, the box says so plainly ("Nothing documented here for 1200 to 1300 CE") and the cell outline stays highlighted even though the grid no longer draws it (owner decided).

A panel beside or over the globe (*builder's call: placement; must not hide the selected cell*). Top to bottom:

1. **Header:** where and when, in plain words, plus the scale: "Area about 22 km across, 500 to 300 BCE". Name the area after its most notable item's place if easy, otherwise coordinates. *Builder's call.*
2. **Story** (Phase 5): 120 to 250 words written by Claude from ONLY the items listed in this box, every claim cited, citations clickable (scroll to and highlight the cited item). Loading state while it is written; the list below shows immediately and never waits for it. If the cell has fewer than 3 events (kinds `event` and `discovery`), no story is generated; the box says "Too little is documented here for a story" and shows the lists. *My call: threshold 3.*
3. **Events** (kinds `event` and `discovery`), ordered by year: year (with "c." or a range when the precision is a decade or coarser), name, and a one-sentence description. Inherited locations are marked "approximate location". Clicking an event expands it to show Wikipedia's opening paragraph and a link to the article. Show the top 25 by sitelinks, then a "show N more" control. *My call: 25.*
4. **People and places** (kinds `birth`, `founding`, `structure`), names only, ordered by sitelinks, top 30 plus "and N more". *My call: 30.* Hover (and keyboard focus) on a name shows a small card: picture, brief description, link to the Wikipedia article. Births read "born here", structures "dated", per decision 18.
5. **Footer line:** attribution for Wikipedia text and images, and the bias caption if space allows.

### 2.3 Text sources (no text is written from memory)

| Text | Source | Fallback |
|---|---|---|
| One-sentence event description | Wikidata description already in the `events` table | Wikipedia summary's `description` field if the Wikidata one is empty; otherwise just the name |
| Expanded paragraph | Wikipedia (English) page summary `extract` | "No English Wikipedia article" plus a link to the Wikidata item |
| Hover card | Wikipedia page summary: `thumbnail`, `description`, `extract` (trimmed to about 2 sentences) | No picture: card without image. No article: Wikidata description and Wikidata link |
| Story | Claude, grounded in the box's items | No story (threshold, error, or rate limit), with a plain message |

The owner asked for a 5 to 7 sentence paragraph. Wikipedia's opening paragraph varies from 1 to 10 sentences. Accepted trade-off: we show Wikipedia's text as is (accurate, attributed, free) rather than have Claude rewrite every article. Coverage: English titles exist for 71% of events, 46% of foundings, 91% of structures, almost all births, 45% of discoveries.

## 3. How it works

### 3.1 Data

- **H3 cells precomputed at load time.** For each row, `etl/load.ts` stores its H3 cell at each resolution the grid uses (one column per resolution, for example `h3_r3` to `h3_r7`, as hex strings). Grid and box queries then filter or group by a column instead of doing geometry at request time. Index choice is measured, as in Phase 2 (decision 25): add `npm run bench:cells` or extend the existing bench, report p50, p95, max per zoom band, and record the results in decisions.md. Keep the worst case under about 100 ms or flag it.
- **Wikipedia summary cache:** a new `summaries` table (title as key, JSON payload, fetched_at). `etl/load.ts` must carry it over across rebuilds the same way it carries `narratives`, or every rebuild throws the cache away.
- **Schema changes are logged** as a new decisions.md entry.

### 3.2 Resolution from zoom

One function in `lib/` maps MapLibre zoom to H3 resolution, so a cell is roughly 30 to 80 px across on screen. Approximate H3 edge lengths: r3 about 60 km, r4 about 23 km, r5 about 8.5 km, r6 about 3.2 km, r7 about 1.2 km. The finest resolution is r5 (see 2.1), so only r3 to r5 need precomputed columns unless tuning shows r2 is needed at the lowest grid zoom. Exact breakpoints are tuned by eye and unit-tested. The cell's resolution travels with every request, so the box describes the cell the user saw, even if the zoom changes after the click.

### 3.3 Endpoints

- `GET /api/cells?west&south&east&north&from&to&zoom`: cells in the viewport and range at the zoom's resolution, each with item count and event count. The client draws boundaries with h3-js `cellToBoundary`. Reuse the existing bbox and antimeridian handling (`lonRanges`). Hexagons that straddle the antimeridian need splitting or normalising before MapLibre draws them; test one near Fiji.
- `GET /api/area?cell&from&to`: the box contents (events and people and places with the fields in 2.2, counts for "show more"). Zod-validated; reject invalid cells.
- `GET /api/summary?title`: server-side Wikipedia page summary through the cache. Sets a User-Agent with `WIKIMEDIA_CONTACT` as Wikimedia policy requires. Verify the current endpoint and response shape in the official docs first (an unverified assumption in PLAN.md), save a fixture, write a test. The client calls it when an event is expanded or a name is hovered (debounced, so sweeping the mouse over a list does not fire 30 requests).
- `POST /api/area/story` (Phase 5): as in PLAN.md Phase 5, with these changes: input is the box's events (top about 12 by sitelinks) plus the top about 5 people and places, each with label, years, kind, location confidence, and its Wikipedia extract. *My call: 12 and 5.* Before writing, the story endpoint fetches any of those extracts not yet in the `summaries` cache (in parallel, through the same cache and User-Agent), so a story's quality never depends on what earlier users happened to hover. Items with no article go in with their Wikidata description. The extracts are part of the input for the eval's "names and years absent from input" check, and because they are CC BY-SA, the story carries a "Based on Wikipedia and Wikidata" credit with links. *My call: consistent stories are worth about a second of first-click latency.* Cache key: H3 cell id (which encodes resolution) + range + `prompt_version` + model. Validation, rate limit, and the eval set are unchanged and mandatory.

### 3.4 Client

`GlobeMap.tsx` gains a grid source and layer (fill plus line), a selected-cell highlight, and click handling; dots keep their source and layer behind a visibility toggle. New components for the box, the event row, and the hover card. Fetching follows decision 27: debounce, abort stale requests, skip identical requests.

## 4. Changes to the existing plan and docs

**Scope of approval.** Once the owner approves this document, Phase 4 is built from it, and the doc edits below land in the same phase. The story is Phase 5, built only after the Phase 4 gate and its own go-ahead.

1. **PLAN.md Phase 4** is replaced by section 2 (minus the story) and section 3 (minus the story endpoint). New acceptance: (a) zooming from orbit to city scale shows a plain globe, then a grid that refines smoothly; (b) clicking the Athens cell for 500 to 300 BCE shows plausible events and people with descriptions, expandable paragraphs, and hover cards with attribution; (c) clicking bare ocean gives the plain "nothing documented" line; (d) a sparse cell (for example in the Sahel or the Amazon basin) shows its few items honestly; (e) no console errors; (f) cell and area queries measured and logged.
2. **PLAN.md Phase 5** keeps its rules and eval. Its input and cache key change as in 3.3, and it renders at the top of the box.
3. **The fallback ladder is retired.** CLAUDE.md's "Emptiness" risk required widening the area stepwise. With a visible grid, empty land is visibly empty and clicks land on cells that have content, so widening would describe an area the user did not select. Replace the CLAUDE.md text with: "the grid only draws cells with documented items; clicking elsewhere says so plainly; never pad."
4. **PLAN.md Phase 6:** the "density heat layer" is largely covered by grid shading; keep it in Phase 6 only if the owner still wants it after seeing the grid.
5. **decisions.md:** a new entry for the grid model, click model, text sources, retired ladder, and the cut-then-restored story.
6. **CLAUDE.md status line** updated at the gate.

## 5. Non-goals for this work

Story on dot click separate from cell click, user-drawn areas, cells at world zoom, non-English Wikipedia text, editing, permalinks (still Backlog), mobile touch handling beyond what works by default.

## 6. Settled questions

- Clicking a dot opens its cell's box (owner, 2026-10-29). Stacks and the web: 2.1b.
- Grid cells stop shrinking at r5; the map itself zooms to the provider's maximum (owner).
- No dots from orbit (owner).
- Range change refreshes an open box (owner).
- Approximate locations: with the r5 cap they stay in cells, are labelled "approximate location", count toward shading and the story threshold, and the story notes them as Phase 5 already requires. Items placed at the centroid of a large region or a sea remain a known limitation of the data. *My call.*

## 7. Left to the builder

Panel layout and styling, hint wording, exact zoom-to-resolution breakpoints, shading curve, debounce timings, index design (measured), splitting Phase 4 into commits. Anything that changes what the user sees beyond section 2 goes back to the owner.
