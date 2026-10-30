# Decisions

Non-obvious decisions and the reasons for them. Newest decisions go at the bottom. Entries 1 to 7 are seeded from `CLAUDE.md`.

## 1. Preload data into our own database; no live Wikidata queries per interaction
A globe with a scrubbing slider fires queries constantly, and the public Wikidata query service is slow and times out. Fanning out to live APIs per request was considered and rejected for this reason.

## 2. Rank by Wikidata sitelink count
Sitelinks (number of Wikipedia language editions with an article on the item) are a cheap notability score. They decide which dots appear at world scale and which events feed the narrative. Known weakness: they favour modern and European events. See the data audit.

## 3. Level of detail by viewport, not fixed radius
"Near the click" has no fixed meaning on a globe. Query by visible bounding box plus year range, show the top N by notability, and let N grow with zoom.

## 4. LLM last, and constrained
Claude only summarizes retrieved events and cites them by id. It must never answer from memory. An invented battle destroys trust in a history app.

## 5. No in-house ML or change detection
That is Picterra's moat and a rabbit hole. If physical-record features are ever added, use precomputed datasets.

## 6. Globe renderer: MapLibre GL JS with globe projection
Continuous zoom from orbit to street level, with real tile basemaps. globe.gl is prettier from orbit but weak up close; Cesium is heavier than needed without 3D terrain.

## 7. Cache narratives by H3 cell + range + prompt version + model
Keeps cost low and makes repeat clicks consistent. Caveat raised at kickoff: a continuous range slider would make nearly every key unique. The slider must snap to era-dependent steps (Phase 3) for this cache to hit. (Superseded by entry 30: nothing is generated at request time, so there is nothing to cache.)

## 8. The audit script is the ETL's fetch stage (2026-10-28, owner approved)
Phase 0 fetches raw SPARQL results per class and time bucket into `/data/raw/` (gitignored, cached, resumable), and `docs/data-audit.md` is computed from those files. Phase 1 adds normalize and load on top of the same files. Wikidata is queried once, and audit counts match the eventual database by construction.

## 9. The audit also measures non-event item types (2026-10-28, owner approved)
Battles are the best-modelled event class, so an events-only database risks war-heavy narratives. The audit additionally measures (a) built structures and archaeological sites with an inception date and (b) notable people's births. These are measured only. Whether they enter the product is decided at the Phase 0 gate.

## 10. Wikidata year numbering (verified live 2026-10-28)
Tests: `tests/time.test.ts`, fixtures in `tests/fixtures/wikidata/`.

- **Entity JSON** (`wbgetentities`, dumps) uses **historical** numbering: Battle of Marathon (Q31900) is `-0490-09-12`, which is 490 BCE.
- **SPARQL** (WDQS) returns `xsd:dateTime` in **astronomical** numbering: the same date comes back as `-0489-...`. Year `0000` is 1 BCE. Conversion: `historical = astro <= 0 ? astro - 1 : astro`.
- **SPARQL converts day-precision Julian dates to proleptic Gregorian** (month precision not checked). Fall of Constantinople start (Q160077, P580) is `1453-04-06` Julian in entity JSON and `1453-04-15` in SPARQL. Marathon moves from Sept 12 to Sept 7. A day-precision date within about 10 days of New Year can therefore land in the neighbouring year. We accept this: it affects few items and only by one year.
- **Year-precision and coarser values are NOT calendar-shifted.** They are normalized to January 1 of the astronomical year (`-0212-00-00` becomes `-0211-01-01`). Eight year-precision BCE battles were cross-checked and agree after conversion.
- **SPARQL returns deprecated statements** without marking them unless you ask for `wikibase:rank`. Example: the 24 August date on the eruption of Mount Vesuvius in 79 (Q2411998) is deprecated in favour of an October date. The fetch must select rank and drop deprecated values.
- Verified test events: Marathon 490 BCE (Q31900), Salamis 480 BCE (Q178850), Vesuvius 79 CE (Q2411998), Constantinople 1453 CE (Q160077). Calendar models: Q1985786 is the proleptic Julian calendar, Q1985727 the proleptic Gregorian calendar (labels verified).

Decision: the ETL reads dates from SPARQL and converts with `yearFromSparqlTime`. Fetching entity JSON for every item would avoid the calendar-shift edge case but costs thousands of extra requests.

## 11. Imprecise-date semantics follow the Wikibase formatter (verified live 2026-10-28)
Checked with the `wbformatvalue` API, so we match what Wikidata itself displays:

- Decade (8) **floors**: `1459` is "1450s" (1450 to 1459); `-0499` and `-0490` are both "490s BCE" (499 to 490 BCE).
- Century (7) **ceils**: `1900` is the 19th century (1801 to 1900), `1901` is the 20th. `-0500` and `-0401` are the 5th century BCE (500 to 401 BCE).
- Millennium (6) **ceils** the same way: `1000` is the 1st millennium, `1001` the 2nd.

Implemented in `effectiveInterval` in `lib/time`.

## 12. TypeScript scripts run on Node directly, with no tsx (2026-10-28)
Node 22.18+ strips TypeScript types natively, so ETL scripts run as `node etl/fetch.ts`. Consequences: relative imports carry the `.ts` extension, and `erasableSyntaxOnly` plus `verbatimModuleSyntax` are on in `tsconfig.json` so the compiler rejects syntax Node cannot strip (enums, parameter properties, value imports of types). `engines.node` is `>=22.18`.

## 13. npm, not pnpm (2026-10-28)
pnpm 10 blocks dependency install scripts by default, and better-sqlite3 needs its install script to fetch a native binary. npm avoids that friction.

## 14. @types/node pinned to ^22 (2026-10-28)
create-next-app 16.4.3 scaffolds `@types/node@^20`, but the runtime is Node 22 and vitest 5 requires Node 22+ types. Types should match the runtime.

## 15. Fetch design: list membership once, then look up details by explicit QID chunks (2026-10-28)
Measured, not assumed. A single query per class that joins class membership with labels, sitelinks, and dates times out on both public endpoints for anything bigger than a few dozen items. What works:

1. **Membership query** per class (`?item wdt:P31/wdt:P279* wd:Q...` + sitelinks floor + has a date). WDQS lists all 15,591 dated battles in about 2 s.
2. **Facet queries** (meta, dates, locs) over `VALUES ?item { ...1000 QIDs... }`, about 1 to 10 s each on WDQS.
3. One raw file per class and chunk under `data/raw/<class>/`, so the run resumes at the chunk level.

Query shape matters on WDQS: the dates facet written as an outer `VALUES ?item` plus `UNION` branches timed out at 60 s, while the same logic with predicates bound through `VALUES (?p ?psv)` took 1 s. Blazegraph evaluated the UNION branches over all of Wikidata before joining.

Deviation from PLAN.md: the plan said to split queries by class and time bucket. Splitting by explicit QID chunks is simpler and never needs OFFSET; time buckets were unnecessary once membership was a separate query.

## 16. QLever for membership of the three huge classes only (2026-10-28)
QLever's public Wikidata endpoint (`https://qlever.dev/api/wikidata`) is live; its data was from the 2026-08-07 dump when checked. It returns the same RDF encoding as WDQS (astronomical years, Julian-to-Gregorian day shift, ranks), verified on Marathon, Vesuvius, Constantinople, and a year-precision battle. It answers whole-class aggregations that WDQS cannot: notable births (152k humans with a located birthplace at ≥15 sitelinks) took 5 s on QLever, while WDQS timed out at 65 s.

But it is a shared research server with roughly a 30 s budget, and it is flaky under load: the same membership query took 49 s once and timed out other times. Failure modes seen: HTTP 429 for server-side timeouts (not only rate limits), and errors appended mid-stream to a body that began with HTTP 200 (marker `!!!!>>#`). The client treats both as retryable with 30 s+ backoff.

So QLever is used only for membership of `settlement-founding`, `structure`, and `birth` (one query each). Every per-item lookup goes to WDQS. Both endpoints get the same User-Agent with the WIKIMEDIA_CONTACT: Wikimedia requires it, and the owner chose to send it to QLever too as a courtesy to its operators (2026-10-28).

## 17. Location stoplist instead of literal "no P17" (2026-10-28)
The rule "never inherit from country" is enforced by type, not by property: a P276 or P131 place is skipped if it is an instance (through subclasses) of country, sovereign state, historical country, empire, continent, sea, or ocean (`locationStoplist` in `etl/classes.json`). Checked live: Greece, Turkey, Byzantine Empire, and Ancient Rome (the state) are stopped; Athens, Classical Athens, Sparta, Ancient Corinth, Marathon, and Salamis Island pass. P17 is never fetched.

## 18. Gate decision: structures and births enter the product, as separate kinds (2026-10-28, owner decided)
The Phase 0 audit showed ancient events are 94 to 100% conflict per century. The owner chose to add built structures and archaeological sites (inception date) and notable births (birth date, birthplace). Each class in `etl/classes.json` now has a `kind`: event, founding, structure, birth, or discovery. This replaces stretching the fixed `category` list: births and structures keep category `culture`, but ranking, quotas, and display copy go by kind.

Consequences for later phases: rank and cap per kind in each viewport, never one mixed ranking (births have about 9 times the median sitelinks of events); births show as people at their birthplace (inherited location, "born here"); structures say "dated", not "built", because inception is sometimes a rebuild. Phase 1 adds a `kind` column to the schema.

## 19. More event classes, chosen from a data-driven gap scan (2026-10-28, owner decided)
Prompted by the owner's examples (Stonewall riots, the 1962 Alcatraz escape, the last guillotine execution, discoveries, science). A QLever scan ranked the classes of dated, located items that our list did not cover, once for all eras at ≥10 sitelinks and once for items before 1500 at ≥3. Added, all QIDs from live label lookups or live query results:

- Civil and social: protest, demonstration, riot (politics); prison escape (other); synod, church council, world's fair (culture); papal election, conclave (politics).
- Accidents and disasters: transport collision, aviation accident, railway accident, shipwrecking (the event, Q906512, not the wreck, Q852190), explosion, disease outbreak (disaster); terrorist attack, mass shooting (conflict).
- More conflict: invasion, conquest, revolt, military raid, pogrom.
- Discoveries: a new kind defined by properties, not a class: any item with time of discovery (P575) and location of discovery (P189). Location comes ONLY from P189, because P276 on museum objects is their current home (the Rosetta Stone's P276 is the British Museum; its P189 is Fort Julien).

Not added: sports and entertainment editions (owner's choice: thousands of post-1950 races, tournaments, and award nights would flood the modern era), military operation and offensive (granular, mostly 20th century, and more war), solar eclipses (the location is only the point of greatest eclipse), geological ages, archaeological periods and cultures (spans, not events).

Not representable as data: "last execution by guillotine". The person (Hamida Djandoubi) is an item, but "last" is a fact in Wikipedia prose. It can reach a narrative only through a Wikipedia extract. A deaths kind (P570 date of death, P20 place of death) would add such people; it is in the backlog, not planned.

Honest limit: these additions mostly enrich modern history. For antiquity the non-war gain is small (councils, synods, a few protests); structures, births, and foundings carry the ancient non-war content.

## 20. QLever: compare years with YEAR(), never against an xsd:dateTime literal (2026-10-28)
On QLever, `FILTER(?d < "1500-01-01"^^xsd:dateTime)` silently matched nothing, while `FILTER(YEAR(?d) < 1500)` found 10,950 items. No error is raised, so a wrong query looks like an empty result. Use `YEAR()` for date filters on QLever, and treat a zero-row result from QLever as suspect.

## 21. Discovery placement: find spot first, own coordinates only for an allowlist (2026-10-28)
A discovery is placed at its find spot (P189). Falling back to the item's own P625 recovers about 1,250 real finds whose site is the item itself (the tomb of Tutankhamun, Lascaux, Chauvet, Persepolis, Abu Simbel), but it also pulled in places with European "discovery" dates at their centroids (Brazil 1500, Greenland, the Cayman Islands, Lake Victoria). A blocklist of geographic classes (country, continent, landmass, body of water, island, region) was tried first: "region" also removed about 150 real archaeological sites and caves, and without it island territories still leaked (Norfolk Island, Bora Bora, the US Virgin Islands) because Wikidata classifies them in many ways. The fallback is therefore an allowlist: own coordinates only for items outside museum collections (no P195) that are archaeological sites, built structures, caves, meteorites, or impact craters (`ownCoordsFilter` on the discovery class in `etl/classes.json`).

Risk to watch: the discovery membership query took 59.5 s on WDQS, just under its 60 s limit. If it times out on a rebuild, move it to QLever (`membershipEndpoint`).

## 22. Among equal-rank dates, the most precise win (2026-10-28; the "then spans them" part is superseded by entry 24)
`chooseDates` keeps only the most precise of the best-ranked values (day, month, and year count as equal), then spans them. Found through Lascaux (Q172125): two normal-rank P575 values, 1940-09-12 at day precision (the discovery) and a millennium-precision value for the paintings' age. Spanning both gave a 19,000-year interval that would match almost every range query. Equal-precision disagreements (Marathon's three dates) still span as before.

## 23. Schema additions and how the database is built (2026-10-28, Phase 1)
The `events` table follows the CLAUDE.md schema plus three columns: `kind` (entry 18), `label_lang` (the label's language, since non-English labels are kept), and `class_key` (the class in `etl/classes.json` the item came from, for debugging and filtering). `loc_source` also takes `P19` (birthplace) and `P189` (find spot). A small `build_info` table records when and from what the database was built. Indexes are the two from CLAUDE.md; no others until Phase 2 measures.

Build: `etl/build.ts` is the single definition of the data set (normalize, dedupe by kind then category priority, year window, width cap), used by both the audit and the loader, so their counts match exactly. `etl/load.ts` validates every row with zod, writes a fresh database to a temp file, carries cached narratives over from the old database, runs the four spot checks against the temp file, and only then renames it into place. A failed load never touches the working database. Rebuilding from the same raw files is byte-for-byte identical in content (same SHA-256 over all rows, checked twice).

First timing (not optimized, for Phase 2): queries limited to a range such as 500 to 300 BCE take under 1 ms; the whole year range at world scale takes about 57 ms per kind (full scan and sort), so up to about 285 ms for five kinds. A `(kind, sitelinks)` index is the obvious candidate if Phase 2 confirms it.

## 24. Several values of a single-moment date: earliest wins, never a span (2026-10-28, Phase 1)
Supersedes the spanning in entry 22. Among the best-ranked, most precise values of a single-moment property (P585, P571, P569, P575), the earliest is used, with its own precision interval. Found when the new 1,000-year width cap dropped Kyoto (P571 794 for Heian-kyo and 1889 for the modern municipality, spanned to 1,100 years) and Stonehenge (construction phases). Several such values are milestones or small disagreements, not a span; real spans come only from explicit start and end properties (P580, P582). After the change the cap drops 10 items, all genuinely vague.

## 25. Events API: per-kind quotas, one covering index, forced (2026-10-28, Phase 2)
`GET /api/events` returns, for each kind, its own top N by sitelinks inside the viewport and year range (overlap filter). Never one mixed ranking: births would take every slot.

**Quotas.** Totals by MapLibre zoom band are the PLAN.md starting guesses: 150 (zoom 0 to 3), 250 (3 to 5), 400 (5 to 8), 600 (8 and up). Each total is split by `KIND_WEIGHTS` in `lib/db/events.ts`: event 40%, founding 20%, structure 15%, birth 15%, discovery 10%, rounded by largest remainder so the caps sum to the total (150 gives 60, 30, 23, 22, 15). Events are the product, so they get the largest share. Births are the most numerous and most linked kind, so they are held down. Unused slots are not passed on to other kinds: they only appear where a kind runs short (no discoveries before 501 CE, few foundings in some eras), and rollover would cost a second query pass for little gain. Both knobs are to be tuned by eye in Phase 3.

**Antimeridian.** One statement serves both box shapes: `(lon BETWEEN w1 AND e1 OR lon BETWEEN w2 AND e2)`, with a single range passed twice when the box does not cross. PLAN.md said to split into two queries; with a sitelinks-ordered index walk the longitude test is only a filter, so the split would add merge, re-sort and re-limit code for no speed gain (a box around Fiji takes 2.5 ms). `lonRanges` also wraps the unwrapped longitudes MapLibre reports after the map is spun past 180 (for example -200 to -160), and treats a span of 360 degrees or more as the whole globe.

**Index, measured.** Timings are per request (all five kinds), on the 255,475-row database:

- Existing indexes only: up to 240 ms for any wide range at world or continent scale (`SCAN events` plus a temp B-tree sort).
- `(kind, sitelinks)`, the candidate from entry 23, is a trap: world scale drops to 1.5 ms, but narrow ranges and empty viewports rise to 64 to 148 ms, because every rejected row costs a table lookup.
- Covering `idx_events_kind_rank (kind, sitelinks DESC, start_year, end_year, lat, lon)`: years and bbox are tested inside the index, so only returned rows touch the table. Hand-picked cases peaked at 15 ms.
- A seeded benchmark (`npm run bench:events`, 300 random viewports per band centred on real event locations, random year ranges) then found the planner still choosing badly: for births and foundings it sometimes took `idx_events_years` for ranges like 3156 BCE to 1531 CE and sorted tens of thousands of rows. p95 80 to 95 ms, max 140 ms. better-sqlite3's SQLite uses bound values for estimates (STAT4), and they are wrong for these two modern-heavy kinds.
- Fix: `INDEXED BY idx_events_kind_rank`. Alternative tried: `+start_year` to hide the year index, max 41 ms but a country-band median of 21 ms, since the planner then picks the `(lat, lon)` index, whose latitude-only range is a strip around the planet. Forcing the index gives one predictable plan whose worst case is a full walk of it.

Result with the forced index (p50 / p95 / max, ms): globe 2.3 / 6.1 / 7.4; continent 3.1 / 12.8 / 22.0; country 5.0 / 23.7 / 40.2; city 7.1 / 43.8 / 46.3. An empty box over the whole range, the walk's worst case, takes 44 ms. Cost: the index adds about 12 MB to the file (58.6 to 70.4 MB) and 0.4 s to the build (index plus ANALYZE). The worst case grows linearly with row count, so revisit (R*Tree, or a per-kind table) if the data set grows several times over. The year and geo indexes are now unused by this query; they stay for Phase 4 area queries until measured otherwise.

**Flagged, not fixed: Europe dominates world scale.** In historical ranges about 80% of each kind's top 60 at world scale are in Europe (for example 500 to 300 BCE events: 50 Europe, 9 Africa and Middle East, 1 Asia). Over the whole range the split is roughly even. Part of this is real coverage bias, which the caption addresses; part is a ranking artifact that a per-cell cap could soften. Judge it by eye on the globe in Phase 3 before adding query complexity.

## 26. Dot colours: three event groups plus a gray for context (2026-10-28, Phase 3, owner decided)
PLAN.md said to colour dots by category. Two problems. First, outside events the category is just the kind under another name (every birth and structure is `culture`, every founding is `founding`), so births, structures, and the 383 real culture events would share one colour. Second, on a map any two colours can sit side by side, so a palette must pass the colour-blindness checks for all pairs, not just neighbours in a legend. Enumerating subsets of the dataviz skill's eight dark-mode hues against the basemap's land (`#0c0c0c`) and water (`#1b1b1d`) found 15 passing sets of three, 2 of four, and none of five or more.

The owner chose: three vivid colours for events (conflict, disaster, and politics and society, which also takes discoveries) and one gray for foundings, structures, and births ("places and people"), so the events the narrative is about stand out from their context. Colours: conflict `#d55181` (magenta), disaster `#3987e5` (blue), politics and society `#008300` (green), places and people `#a3a29b`. All pairs including the gray: worst colour-blind separation 8.1 (target 8), worst normal-vision 19.2 (floor 15). The first choice, red, violet, and aqua, was rejected because red and aqua measured 6.5 under protanopia. The gray recedes by being achromatic, slightly smaller, and drawn beneath events, not by being dim: dimming it would collapse its distance from green. Hollow rings still mean inherited locations. Re-validate before changing the basemap.

## 27. Globe wiring: MapLibre 6 worker URL, basemap, and the whole-world query below zoom 3 (2026-10-28, Phase 3)
- **Worker.** MapLibre 6 ships its web worker as a separate file and looks for it beside its own module. Turbopack moves the module into a chunk, so the worker 404ed and no tiles drew ("Worker failed to load"). Fix: `setWorkerUrl(new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href)`. Turbopack emits the file as a hashed static asset in dev and in `next build`, and it stays locked to the installed version, with no copy step.
- **Basemap.** OpenFreeMap's dark style is the default when `BASEMAP_STYLE_URL` is unset: free, no API key, no request limits, commercial use allowed, attribution required (MapLibre's attribution control shows it, and so does the footer).
- **Viewport below zoom 3.** At those zooms the globe fills the view and matches the API's globe band, so the client asks for the whole world instead of trusting `getBounds()` on a sphere with a pole or the far side in play.
- **Fewer requests.** Fetches are debounced by 200 ms and stale ones aborted. MapLibre fires extra `moveend` events (after the projection switch, at the end of zoom animations), so a request identical to the last successful one is skipped. Measured: 20 keyboard steps on the slider make one request; a page load makes one.

## 28. Grid view and area box replace "click anywhere, widen until found" (2026-10-29, Phase 4, owner decided)
The owner redesigned exploration before Phase 4 was built. Full design: `docs/superpowers/specs/2026-10-29-area-panel-design.md`.

- **Grid, not a guessed area.** From about zoom 3 the globe shows H3 cells that hold items in the selected range; clicking one opens its box. The clicked area is the outlined area, which answers "what does near here mean" visibly and removes the edge effect of querying a hidden hexagon. Empty land is visibly empty, so the widening fallback ladder in CLAUDE.md is retired: widening would describe an area the user did not select.
- **Finest cell r5 (about 20 km across).** 42% of events and every birth borrow the coordinates of a city or region (inherited location). Finer cells would pile them into one downtown cell and claim precision the data lacks. The map still zooms to the provider's maximum; cells just grow on screen.
- **Dots optional and never from orbit.** Off by default; when on, overlapping dots merge into a stack that fans out into a web on hover (owner's sketch), at most 8 legs plus "+N more". Every click on a dot opens its cell's box, so there is one box model and one story cache key.
- **Text sources.** Event one-liners from Wikidata descriptions, expanded paragraphs and hover cards from the English Wikipedia page summary, fetched server-side and cached in a `summaries` table that `etl/load.ts` carries across rebuilds like `narratives` (superseded by entry 29: the cache is its own file, `data/cache.db`, which needs no carry-over). Nothing is written from memory. Wikipedia's opening paragraph varies in length; accepted over having Claude rewrite every article.
- **The story was briefly cut, then restored** at the top of the box (Phase 5). Recorded because the cut was considered: without the story the product is close to existing marker-and-slider maps.

## 29. Phase 4 as built: bands, benchmarks, colours, and deviations (2026-10-29, Phase 4)
**Resolution bands** (`RES_BANDS` in `lib/cells.ts`, unchanged from the first guess): r2 from zoom 3, r3 from 4.3, r4 from 5.6, r5 from 7, none finer. On screen at 1280 by 800 a cell is about 42 to 150 px across in each band, judged fine by eye. `cellAcrossKm` uses h3-js's real average values (r2 365, r3 138, r4 52, r5 20 km). The design's "about 17 km" for r5 was low and is corrected to about 20 km in entry 28 and in the spec.

**Cell query, measured** (`npm run bench:cells`, 300 seeded viewports per zoom, 255,475 rows, ms, p50 / p95 / max):

- Planner's choice with the existing indexes: zoom 3 14.6 / 451 / 465, zoom 4.3 3.5 / 488 / 541, zoom 5.6 1.7 / 488 / 500, zoom 7 1.6 / 491 / 505. It scans a whole `h3_rN` index for GROUP BY regardless of viewport.
- Forcing `idx_events_geo`: max 415, 350, 127, 35 ms. Still too slow when zoomed out, because every row costs a table lookup.
- One wide covering index (years, lat, lon, kind, r2 to r5): max 101, 91, 61, 13 ms; database 146 MB.
- Chosen: one covering index per resolution, `(lat, lon, start_year, end_year, kind, h3_rN)`, with `INDEXED BY`, the same approach as entry 25. Final p50 / p95 / max: zoom 3 11.3 / 65.4 / 68.4, zoom 4.3 9.0 / 52.3 / 57.8, zoom 5.6 4.5 / 14.0 / 26.2, zoom 7 1.8 / 6.8 / 9.0. Worst cases are all-time ranges zoomed out. A cold page cache will be slower than these warmed runs. The wide index (about 100 ms worst case) is the fallback if size matters.
- Area query (the box), worst band zoom 3: p50 0.4 / p95 4.1 / max 43 ms (an r2 cell), under the 100 ms bar, so no further index.

**Database size.** 70.4 MB after Phase 2, 115.5 MB with the `h3_r2` to `h3_r5` columns, 179.9 MB with the four covering indexes. That is 2.5 times the Phase 2 size and matters for the Phase 7 deploy. `idx_events_geo` (7 MB) is probably unused now and was not dropped.

**Grid fill colours.** Fill is `#e6e6e6` at low opacity. The dataviz validator checked it as a composite over the land (`#0c0c0c`) and water (`#1b1b1d`) colours, under the four dot colours. At 0.20 some dots fall to a contrast of 1.97 to 2.97 (fail), 0.12 and 0.07 still fail on green, and 0.06 passes (all dots at least 3:1). So the fill has two stop sets: while dots are hidden, 0.03 / 0.07 / 0.13 / 0.2 for 0, 1, 10, and 50 or more events; while dots are visible, the validated 0.02 / 0.03 / 0.045 / 0.06. The check only constrains the background under dots, so the stronger stops are used when there are none. Shading is therefore subtle with dots on, and the grid lines carry the look.

**Stack look.** A near-white disc `#f0efec` (the UI's text colour, belonging to no group, so a mixed stack never claims one kind) with a `#0c0c0c` count in "Noto Sans Bold". Validator on all five colours: worst colour-blind pair is still 8.1 (gray and magenta, unchanged from entry 26), stack contrast 17.0 on land and 15.0 on water. Cluster radius 12 px (8 let a small stack sit on top of the big one and take the pointer), `clusterMaxZoom` 22, source `maxzoom` 23. The web opens after a 120 ms hover intent so passing over a small stack does not open the wrong web.

**Controller rulings.**
- **The summaries cache is `data/cache.db`, not a table in `chronoglobe.db`** (deviation from entry 28). The app opens `chronoglobe.db` read-only, and an open handle blocks `etl:load`'s rename on Windows. A separate writable file needs no carry-over on rebuild.
- **`/api/summary` takes a qid, not a title**, and looks up the item's stored `wikipedia_title`, so it cannot be used as an open proxy to Wikipedia under the owner's contact or to fill `cache.db` with arbitrary titles.
- **A stack's centre and "+N more" open the cell holding most of its members** (ties go to the cell of its most-linked member), not the cell under the cluster centroid, which may hold none of them.
- **Event rows with no Wikidata description show only the name.** The spec's fallback to the Wikipedia description was not built: it would need up to 25 summary fetches per box.

**Known gaps.** There is no keyboard path to open a dot web (the legs are focusable once it is open). Stack counts need the basemap font "Noto Sans Bold" (OpenFreeMap serves it; another style may not). The database grew from 70 MB to 180 MB, relevant to Phase 7.

## 30. Phase 5 as built: offline featured stories replace live narratives (2026-10-30, Phase 5, owner decided)
Full design: `docs/superpowers/specs/2026-10-29-featured-stories-design.md`. Supersedes key decision 7 in CLAUDE.md and the narrative text in PLAN.md Phase 5 and in section 3.3 of the area panel spec.

**Why.** The owner has no budget for API calls, so nothing is generated at request time. About twenty stories are written offline in Claude Code sessions and committed. A "Featured stories" list in the left panel sets the range, flies to the cell, and opens the box with the story on top. Every other selection shows the box as Phase 4 built it.

**Dropped.** Live generation, the Anthropic SDK, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`, the rate limiter, `POST /api/area/story`, and the `narratives` table with its carry-over in `etl/load.ts`. The item-based cache key the owner approved earlier (cell + range + prompt version + model) is moot: nothing is cached because nothing is generated. `/api/area` is GET only.

**How a story is made.** `npm run story:input -- <id>` freezes the cell's top 12 events plus top 5 people and places with their English Wikipedia extracts (or Wikidata descriptions) into `stories/inputs/<id>.json`, plus a generated context item `C` for sentences about the area as a whole. A fresh writer subagent given only `stories/RULES.md` and the input writes `stories/<id>.json`. A checker then must pass; then a second fresh subagent reviews it against the rules and input; its findings are fixed and the checker runs again. The owner reads all twenty at the gate. Inputs never reach the browser.

**The checker is stricter than the old plan.** `lib/narrative` checks per sentence against only the items that sentence cites, not against the whole input. That also catches a true fact cited to the wrong item. It checks shape (every sentence cited, refs exist, 60 to 250 words, no em or en dash), every number (with era: a story "430 CE" cannot pass against "430 BCE"; spelled-out numbers are read as digits and checked the same way: one to nineteen, dozen, the tens words twenty to ninety, hyphenated compounds such as twenty-five, and ordinals such as third or twentieth, while magnitude words (hundred, thousand, million, billion) multiply the number before them and are compared by value, and plural forms such as hundreds, thousands, dozens, and scores must appear as the same word in the cited text; this differs from spec 6.6 item 2, by ruling), and every capitalised word (must appear in the cited text or in one global allowlist of era words, months, and sentence starters). It runs on every committed story inside `npm test`. The allowlist never changed and the checker was never loosened to pass a story. What it cannot catch (relocated deeds, wrong relationships between correct names, invented causal links, "a decade later", "a century later", "twice", names written in lowercase, and an ordinal against a cardinal such as 3rd against 3) is the reviewer's and the owner's job.

**Measured outcome of the process.** All twenty picks from the design shipped; none was replaced. Reviewer findings per story, all rounds, including fixes that were re-reviewed: panipat 0, rome 0, medina 0, port-au-prince 1, kyoto 1, mombasa 1, constantinople 1, athens 2, babylon 2, seoul 2, cusco 2, lhasa 3, baghdad 3, tenochtitlan 3, paris 4, gallipoli 5, jerusalem 6, isandlwana 6, beijing 6. That is 48 recorded across 19 stories. Carthage also had findings that were fixed and re-checked clean, but its count was not recorded, and the checker runs and writer revisions per story were not recorded for all twenty, so no total is given. Three stories were clean at first review (panipat, rome, medina); 17 of 20 were revised after review. The controller overruled two findings with a ruling (paris, "only the most notable appear"; beijing, publication-year order).

**Rulings that shaped the writing.** BCE years always carry "BCE"; CE years are written as the cited text writes them. From the second batch on, writers prefer an item's years field over a conflicting extract year, because the box shows the years field under the story.

**Data quirks the process found.** Honkoku-ji incident: years 1559, description says 1569. Baghdad E8 is labelled in French: sédition de Karkh. Berossus's birth date in Wikidata looks wrong (500 to 401 BCE, contradicting its own third-century text). Mark the Evangelist has an inherited birth in Jerusalem that conflicts with his extract. Tupac Inca Yupanqui: the description says 12th, the extract says tenth. Wikidata "founding" dates for Mombasa (1593) and Cusco (1534) are later than events there, because they record a colonial refounding. Relief of Ladysmith: years field 1899 CE, extract ends 28 February 1900. None of these were corrected in the data; stories follow the rulings above.

**Publish step.** `npm run story:publish` validates every story against its frozen input and writes `stories/published.json`. The client imports that one file, so the inputs, with their full extracts, stay out of the bundle. `tests/stories.test.ts` requires `published.json` to equal the `publishStories` output at every commit, so it cannot go stale silently.

**Staying current.** `npm run story:check` (needs the database; run after `etl:load`) confirms each story's cited qids are still in its box with unchanged labels and years. Ranking drift only warns, and so does a changed context sentence or location confidence (warnings do not make a story stale and leave the exit code at 0). At runtime a story is hidden, with a `console.warn`, if any cited qid is missing from the box's response.

**Coverage gaps, measured.** These places had fewer than 3 documented events in any sensible cell and range and were dropped as picks: Timbuktu, Great Zimbabwe, Aksum, Teotihuacan, Angkor, Giza, Knossos, Benin City, Tikal, Varanasi, Lagos, Kano, Hiroshima (1939 to 1950). This is the coverage bias in CLAUDE.md, measured, and it is why the Featured list deliberately spans continents and eras rather than only well-documented regions, even at thin counts such as mombasa (5 events) and panipat (3). Six picks are deliberate stress cases: athens (the famous neighbours are in other cells, and half its events have no article), panipat (exactly 3 events), lhasa and paris (most or all locations inherited), kyoto (27 events, only 7 with articles), and mombasa (5 events across four centuries).

## 31. Owner decisions at the Phase 5 gate (2026-10-30, Phase 5, owner decided)
**The twenty featured stories are the product.** Every other area shows its list.

**Say approximate placement once per story** (`rulesVersion` 2). The per-event note read as a tic and spent words, and the box already marks each item under the story. The sentence covers events and people alike: a count of approximate events alone implied that approximate births were exact, so eight stories were reworded to say "some locations in this account are approximate". Seventeen stories were rewritten. Panipat and isandlwana cite no inherited item, and gallipoli has one note on its one inherited item, so those three already complied and stay at `rulesVersion` 1.

**Measured outcome of the rewrite.** All 17 passed the checker on their first run. Fresh reviewers then raised 20 findings across 9 stories (carthage 4, athens 3, medina 3, beijing 3, lhasa 2, constantinople 2, tenochtitlan 1, rome 1, mombasa 1); the other 8 were clean. Some findings were in sentences earlier reviewers had passed, such as the Tiananmen sentence and the Tenochtitlan founding date. Review reduces this risk; it does not end it.

**Licence wording stays as built.** The story credit names Wikipedia (CC BY-SA) and Wikidata and links to those sites; each cited item links to its article from its row in the box. Raised at the gate, owner judged it not important.

**The Featured list starts open on a tall screen** (at least 700 px), closed on a short one, because the list is the way to a story.

New data quirk: the Mercenary War's years field says 240 BCE and its extract says 241. The Carthage story gives the war no dates.
