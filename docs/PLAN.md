# Chronoglobe: plan, phases, and background

Companion to `CLAUDE.md`. `CLAUDE.md` holds the standing rules and conventions. This file holds the origin story, product framing, phase-by-phase plan, backlog, and open assumptions. Read the relevant phase before starting it. Context date: 2026-10-28.

## 1. Origin and context

- The idea started from looking at Picterra (picterra.ai), a Swiss GeoAI company. Its main product (Insights Hub) is an enterprise supply-chain and deforestation-compliance platform. The relevant piece is **Picterra Lens** (lens.picterra.ai), a free tool: you spin a globe, zoom into an agricultural area, an analysis frame of a few hundred hectares is auto-drawn, and it returns indicators (fire and flood history, land cover, forest change since a 2020 baseline, land-conversion emissions, climate outlook) from satellite and public datasets. It has no date range and produces no narrative.
- The owner's idea is a DIFFERENT product: a fun project, not a clone. They first imagined "pick a spot in Greece plus a date range, learn what happened on that land". After discussion they chose to focus on **ancient and human history**, framed as a "Wikipedia globe": move around a digital globe, choose a time range, click an area, see events near it within that range, with cool visuals.
- The owner will build this with Claude Code. It is a for-fun solo project. Prefer simple, boring, working solutions. Do not over-engineer.

## 2. Product details

### Goals
- Smooth globe with a two-handle time-range control.
- Events from Wikidata, ranked by notability, served from OUR OWN local database (never live Wikidata queries at request time).
- Click an area: the event list; a featured place also gets a grounded, cited story.
- Honest handling of sparse and biased data.
- Good-looking visuals (see Phase 6).

### Non-goals (do not build unless the owner asks)
Accounts, editing or crowdsourcing, historical borders, real-time data, mobile app, 3D terrain, satellite change detection, multi-language UI.

### Differentiator and prior art
Prior art exists, so a plain "events on a map with a slider" is not novel:
- Chronas (chronas.org): time slider, historical borders, Wikipedia-linked markers for cities, battles, artifacts, people. Sources describing it are years old; its current state is unverified.
- Histography: interactive timeline of events pulled from Wikipedia (older reviews, unverified current state).
- OpenHistoricalMap: time slider over historical map objects (borders, buildings), not events.

Our differentiator is: **click an area, pick a range, get a grounded narrative of what happened there**. The globe is the vehicle; the narrative quality is the product. Invest accordingly and do not compete on borders. Since decisions.md entry 30 this holds only for the twenty featured stories, because there is no budget for live generation.

## 3. Phases

### Phase 0: Scaffold and data audit (GATE: owner decides before Phase 1)
1. Scaffold the project: Next.js + TypeScript, lint, vitest, `.env.example`, `.gitignore` (including `/data`).
2. Build `/lib/time` with year conversion and tests.
3. Write an audit script that queries Wikidata for event-type items (battles, sieges, wars and campaigns, treaties, earthquakes, volcanic eruptions, foundings of cities, coronations, revolutions, epidemics, plus others you judge worthwhile) that have a date and either coordinates or an inheritable location.
4. Produce `docs/data-audit.md`: counts by category; counts by coarse region (lat/lon boxes are fine); counts by century back to 3500 BCE; share of exact vs inherited locations; sitelink distribution; year-zero test findings.

Wikidata etiquette: User-Agent from `WIKIMEDIA_CONTACT`, throttle requests, expect public endpoint timeouts, split queries by class and time bucket instead of OFFSET pagination. If large queries keep failing, evaluate QLever's public Wikidata endpoint (unverified that it is currently available) and log findings.

Acceptance: the report exists and states plainly where coverage is thin, and recommends a sitelink threshold. STOP and report. If coverage is poor in regions and eras the owner cares about (Greece and the Mediterranean first), say so clearly and propose alternatives before anything else is built.

### Phase 1: ETL
1. `/etl` scripts: fetch per class and time bucket, normalize with zod, map to categories via `classes.json`, compute effective intervals, resolve inherited locations, dedupe by QID.
2. Load into SQLite. Idempotent and resumable.
3. Apply the agreed sitelink threshold (configurable).

Acceptance: one command rebuilds the DB from scratch. Row counts match the audit within reason. Spot checks pass (Marathon, Thermopylae, Vesuvius, Constantinople have sensible years and coordinates). Tests cover normalization edge cases.

### Phase 2: Events API with level of detail
*Superseded in Phase 6: `GET /api/events` was removed with the dots (decisions.md entry 32). This section is kept as history.*

`GET /api/events?west&south&east&north&from&to&zoom` (as built then)
- Validate params with zod.
- Handle bounding boxes that cross the antimeridian (done as one query with two longitude ranges, not two queries; see decisions.md entry 25).
- Filter by overlap, order by `sitelinks` descending, limit N by zoom band (starting guess: about 150 at world scale to about 600 at city scale; tune by eye).
- Return minimal fields for dots.

Acceptance: query time well under 100 ms in the largest zoom band. Tests include an antimeridian case and an overlap case with century-precision events.

### Phase 3: Globe UI
*Superseded in Phase 6: the dots, legend, preset chips and dark basemap were replaced by the cream globe (decisions.md entry 32). Kept as history.*

- MapLibre globe with a dark, minimal basemap.
- Dots colored by category, hollow for inherited locations. (Done as four legend groups, not seven categories: three event colours plus a gray for foundings, structures, and births. See decisions.md entry 26.) Refetch on move end and range change (debounced).
- Two-handle range control on a NON-LINEAR scale (more resolution for recent centuries than deep antiquity), plus preset chips such as "Classical Greece (500 to 300 BCE)".
- Legend, data-bias caption, attributions. Keyboard-accessible slider.

Acceptance: spinning, zooming, scrubbing feel smooth. Zooming into Greece for 500 to 300 BCE shows plausible events. No console errors.

### Phase 4: Grid view and area box (revised 2026-10-29)
*The H3 grid, dots, stacks and web were removed in Phase 6. The area box, its lists, Wikipedia paragraphs and hover cards stayed. Kept as history.*

Redesigned with the owner; the full design is `docs/superpowers/specs/2026-10-29-area-panel-design.md` (decisions.md entry 28). In short: a plain globe from orbit; from about zoom 3 an H3 grid of cells that hold items in the range, finest cell r5; dots optional, never from orbit, overlapping dots merge into a stack that fans out into a web on hover; clicking a cell or dot opens a box with events (Wikidata one-liner, Wikipedia paragraph on expand) and then people and places (names, hover card with picture). Wikipedia summaries are fetched server-side and cached in SQLite. The old widening fallback ladder is retired.

Acceptance: (a) zooming from orbit to city scale shows a plain globe, then a grid that refines smoothly and stops at r5; (b) clicking the Athens cell for 500 to 300 BCE shows plausible events and people with descriptions, expandable paragraphs, and hover cards with attribution; (c) clicking bare ocean gives a plain "nothing documented" line; (d) a sparse cell (for example in the Sahel or the Amazon basin) shows its few items honestly; (e) stacked dots fan out into a web and each leg opens its item; (f) no console errors; (g) cell and area queries measured and logged.

### Phase 5: Featured stories (revised 2026-10-29)
Replaced. There is no live generation: the owner has no API budget, so about twenty stories are written offline in Claude Code sessions, checked mechanically against frozen inputs, reviewed, and committed. A Featured list in the app flies to each one. The full design is `docs/superpowers/specs/2026-10-29-featured-stories-design.md`; what was built and measured is decisions.md entry 30.

### Phase 6: Redesign (replaced 2026-10-30)
Built as a redesign, not polish. The globe starts blank on warm paper; clicking anywhere reveals an outline of the region that mattered in the chosen years (Cliopatria, then historical-basemaps, then the modern country, built from Natural Earth provinces, capped at 800 km), with a reading column of events, people and places, and the twenty stories reachable by clicking or from a Stories list. The full design is `docs/superpowers/specs/2026-10-30-phase-6-redesign-design.md`; what was built and measured is decisions.md entry 32.

Dropped by the owner: the play button ("I never imagined pressing play. This isn't a game.") and the density heat layer (the blank globe rules it out). Both are non-goals now, not backlog.

Acceptance: the list in section 6 of the spec.

### Phase 7 (optional): Deploy
Run locally first. SQLite on serverless is awkward: prefer a host with a persistent volume, or ship the DB file read-only.

## 4. Backlog (ideas deliberately deferred; do not start without the owner's go-ahead)

- Physical record layer (the owner's original idea, closer to Picterra): earthquakes from the USGS catalog, fire hotspots from NASA FIRMS (free key, roughly 2000 onward), land cover change from CORINE Land Cover (Europe, a few snapshots 1990 to 2018), forest loss from Hansen/Global Forest Watch, surface water change from JRC Global Surface Water. Use precomputed datasets only, no custom ML.
- Authoritative historical borders. Partly done in Phase 6 as approximate outlines (Cliopatria and historical-basemaps, decisions.md entry 32); anything beyond that is contentious and already done by Chronas and OHM.
- Pleiades gazetteer for ancient places; extra sources for non-European coverage gaps.
- Historical imagery basemap (for example Esri World Imagery Wayback); verify terms before use.
- Shareable permalinks for area plus range. (The area URL exists for the API; a page-level permalink does not.)

## 5. Unverified assumptions (check these, do not trust them)

- Current state and URLs of Chronas, Histography, OpenHistoricalMap.
- Whether QLever's Wikidata endpoint is available and suitable.
- Exact MapLibre globe-projection API and current version.
- Wikidata year-zero and precision handling details.
- Wikipedia summary endpoint shape and rate limits.
- Basemap provider free-tier terms.

## 6. Definition of done for v1

A stranger can open the app, spin to the Mediterranean, pick Athens, 500 to 300 BCE from the Stories list (or set the range by hand and click in Attica), and read a cited, accurate story within a second. Clicking somewhere with no data gives an honest empty state. The README explains setup, the ETL command, env vars, and data attributions.
