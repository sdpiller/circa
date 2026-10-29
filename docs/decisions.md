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
Keeps cost low and makes repeat clicks consistent. Caveat raised at kickoff: a continuous range slider would make nearly every key unique. The slider must snap to era-dependent steps (Phase 3) for this cache to hit.

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
