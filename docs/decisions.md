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
