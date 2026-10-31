# Phase 6 redesign: a cream globe you explore by clicking

Date: 2026-10-30. Status: for owner approval; nothing is built. This replaces the Phase 6 text in `docs/PLAN.md` and reverses parts of decisions 3, 26 and 28. Read `CLAUDE.md` and `docs/superpowers/specs/2026-10-29-featured-stories-design.md` first; their conventions hold unless this document says otherwise.

The owner tested each visual decision here in a throwaway prototype. It lives in `.superpowers/brainstorm/` (git-ignored; sources in `460-1793391168/src/`, last screen `look-v8.html`). It is a reference for the look and feel, not code to keep. It uses historical-basemaps only, and its controls do not ship.

Marks: *Owner:* decided by the owner in conversation. *My call:* decided by the writer of this document; the owner can overturn it at review. *Builder's call:* left to whoever builds it.

## 1. Intent

Phase 4 and 5 produced a working product that looks like a dark technical tool: a dense hexagon grid, a crowded left panel, labels everywhere. The owner's verdict after using it: too dark, the grid feels weird, the UI has no hierarchy, the globe is too crowded with names.

What the owner wants instead is a quiet, warm object you explore. The globe starts blank. **Clicking anywhere reveals an outline of the region that mattered in the years you chose, and that discovery is the fun.** It should feel at home beside samarchive.com and kaboose.io.

The owner also ruled out the plan's headline Phase 6 feature, the play button: "I never imagined pressing play. This isn't a game."

## 2. Goals, non-goals, anti-goals

**Goals.**
- The eye goes to three things only: the globe, the date range, the selected region's information.
- A click on land usually reveals a named historical outline for the chosen years.
- The outline shown is exactly the area whose events are listed. This holds for stories too, because the provinces holding a story's cited items are always inside its outline.
- The twenty featured stories survive, still about their places, and can be stumbled on by clicking. Their approved text stays, apart from the sentences in section 4.3.
- Everything moves smoothly.

**Non-goals.** Play button or time sweep. Density heat layer (the blank globe rules it out). More than twenty stories. Authoritative historical maps. Narrow or mobile layouts below 1024 px wide. Serif map labels.

**Anti-goals (failure even if it works).**
- Outlines that look thin, broken up, or scattered (*Owner*).
- Any visible geometric artefact that reads as a tool's mark: hexagons, circle arcs (*Owner:* chose "follow borders" over "circle cut").
- Country names that appear or vanish while panning at one apparent zoom (*Owner:* reported as "a glitch").
- A story shown for years it was not written about. The story's exact years must be on screen whenever it shows.
- A story that contradicts the list beside it, such as "only 8 events are documented here" above a list of 80.
- A modern border presented as if it were historical, or a historical outline presented as authoritative.

## 3. What the user sees

### 3.1 Layout (*Owner:* "Layout A", tested)

- A full-bleed globe on warm paper. Nothing is drawn on it before a click: no grid, no dots, no legend (*Owner*).
- Top left: wordmark "CHRONOGLOBE" and one "Stories" link that expands a short list.
- Bottom centre, over the globe: the dates set large in serif ("500 BCE to 300 BCE"), the two-handle slider, and a quiet one-line coverage caption ("Documented history is not the same as history: coverage is uneven worldwide."). The caption is required by `CLAUDE.md` and stays.
- Right: a reading column, closed until a click. It slides over the map; the map never resizes. Width about `min(420px, 36vw)`.
- Attribution in the map's compact control and a small footer link. *Builder's call:* exact placement, as long as it stays quiet and every source in section 7 is credited.

**Removed from the screen** (*My call,* from "UI is too dense"; the owner saw it in the prototype and did not object): the left panel, the legend and counts, the "Show dots" toggle, the era preset chips, the status line. The temporary Edges, Radius and Era controls in the prototype do not ship.

### 3.2 Look (*Owner:* direction; values *My call,* matched to the two sites)

Paper `#faf7f0`, sunk paper `#f1ede4`, ink `#241f1a`, soft ink `#57514a`, muted `#7f786e`, rule `#d9d3c7`, violet accent `#5140a4`. Land `#f8f4ea`, water `#e3ded2`, map lines `#cfc8ba`, roads `#e6e0d3`. Fraunces for display, Newsreader for text, thin rules, no rounded cards. Load fonts with `next/font/google` (no new dependency). The basemap is OpenFreeMap's positron style recoloured at runtime; `BASEMAP_STYLE_URL` stays as the override. Map labels stay in the tile provider's sans font, because serif glyphs are not offered.

### 3.3 Names by zoom (*Owner:* requirement; mechanism measured)

Names appear only as you zoom in, in groups, the same everywhere on Earth. All countries appear together.

MapLibre's globe lowers `getZoom()` as the camera moves away from the equator, to hold the globe's size on screen: a drag from Africa to high latitudes took it from 3.35 to 2.02 with no visible change in scale. So a zoom threshold fires during a pan. Drive the labels from a value that does not move while panning:

`apparentZoom = getZoom() - log2(max(cos(latitude), 0.05))`

| Apparent zoom at least | Names |
|---|---|
| 3.15 | All countries (all three rank layers together) |
| 3.9 | Seas |
| 5.2 | Capitals |
| 6.0 | Cities, states |
| 8.0 | Towns |
| 10.5 | Villages |
| 12.0 | Other places, rivers |

On `move`, compare against the thresholds with a dead band of about 0.08 so a slow zoom does not flicker; fade `text-opacity` over about 320 ms and set `visibility: none` after the fade, so hidden labels stop taking part in collision. Remove the style's own `minzoom` on these layers. The logic is a pure, tested function in `lib/`. In dense areas a small country can still lose a label collision; that is accepted.

### 3.4 Motion (*Owner:* panel slide; the rest *My call* under "use your best judgement")

- Panel: slides in and out over about 460 ms. The camera eases its `padding.right` over the same time with the same curve, so the globe glides to stay centred in the free space.
- Selecting: the camera flies to the area (about 1.5 s), then the outline fades in (about 500 ms).
- Dates: the numbers count to the new values and the slider handles glide (about 620 ms) when a story or list entry sets them. Dragging a handle does not animate.
- Panel text crossfades when switching areas. The Stories list expands smoothly. Citation clicks scroll smoothly and flash the cited row.
- Page load: the globe fades in. No auto-spin or motion the user did not start.
- `prefers-reduced-motion` makes all of it instant.
- Acceptance is by feel on the owner's machine; automated frame timing in headless runs is not trustworthy.

### 3.5 Clicking

A click on land or near a coast:
1. The panel opens at once with a quiet loading line, and the camera moves.
2. The outline fades in when the answer arrives. Stale answers are aborted, as `GlobeMap` already does.
3. The panel shows, in this order: the area's name, the atlas line if any, its years, its scale, the story if any (under its own place name, such as "Athens"), then Events, then People and places as Phase 4 built them (hover cards and lazy Wikipedia text stay).

**The atlas line** (*Owner*). A name that comes from historical-basemaps shows a quiet line under it: "A broad label from a historical atlas." Non-state labels such as "Semites", "Bantu" and "Hunters-gatherers" stay, subject to the review in section 5.2.

**The scale line is required by `CLAUDE.md`.** A historical outline reads "about 130,000 km², approximate, built from modern provinces", with "within 800 km" added when the cap cut the region. A modern outline reads "about 130,000 km², modern borders", with the same addition. *My call:* every historical outline says it is approximate, so no precision field is stored or read, and historical-basemaps' `BORDERPRECISION` is dropped.

**Empty cases say so plainly, never padded.** A selected area with no items shows its outline and "Nothing documented here for these years." Open water more than 50 km from any province closes the panel, or shows "Open water", with no outline. *Builder's call:* which of the two. A point within 50 km of a province counts as a click in the nearest one.

**The stored click point, not the shape, is the selection** (*My call*). Moving the range with an area selected re-derives the outline from the same point.

### 3.6 Which outline (the rule)

*Owner:* the region relevant to the selected time range; edges follow borders; maximum radius 800 km; both datasets, Cliopatria first, then historical-basemaps, then the modern country. *My call:* the span limit, the held test in step 2, the province point retry, and the small-piece rules.

Given a click and a range, let `y` be the middle of the range.

1. **Range wider than 500 years, no story showing:** no single era fits, so go to step 5. This includes the "all time" view.
2. **Cliopatria, held for the range:** take the `POLITY` rows that overlap the range and contain the click, and add up, per name, the years inside the range that each name held the spot. If the top name holds at least half of the range, it is the region, with the shape of its row nearest `y`.
3. **Historical-basemaps:** the snapshot nearest `y` (each snapshot owns the years closest to it). Take the named feature containing the click, plus all features with the same `NAME` in that snapshot. A name struck in the review of section 5.2 counts as absent.
4. **Cliopatria at `y`:** any `POLITY` row containing the click at `y`; if several, the smallest by `Area`.
5. **Modern country:** all provinces of the clicked province's country, labelled "modern borders".

If steps 2 to 4 find nothing at the click, try them once more at the clicked province's representative point, because old shapes miss coasts. Then go to step 5.

**Why the held test.** Testing only `y` asks about one year. Cliopatria splits a polity into many short rows, so at 500 to 300 BCE Athens hit "Peloponnesian League" (a row of 404 to 384 BCE), and Beijing at 1900 to 1990 hit "Empire of Japan" (a row of the single year 1945). Lhasa at 600 to 1950 hit "Mongol Empire". With the held test the same clicks give "Greek city-states", "China" and "Tibet", while Sparta still gets "Peloponnesian League" and Rome still gets "Roman Empire". Steps 2 to 4 still find a region wherever the coverage table below does, so the test changes which name wins, not how often a name is found. It keeps Cliopatria first wherever Cliopatria is the better answer for the years chosen.

Steps 2 to 4 give a historical region. Turn any region into a shape the same way:

- Start from the clicked province, always (so a tiny region such as an 879 km² shogunate still gives a usable area).
- Add every province whose representative point is within 800 km of the click and inside the region. For step 5, add those within 800 km in the same country.
- If a story is showing, add its provinces (section 4.2), whatever the distance.
- Merge them into one outline by cancelling shared edges (section 5.3).
- Remove holes, pieces under about 350 km² unless clicked, and pieces more than about 120 km from the clicked piece (*Owner:* "broken up"; the owner saw these rules in the prototype). A story's own provinces keep their pieces.
- The lists cover every province that keeps at least one piece in the outline, so the outline and the lists describe the same area.

**The same-name rule does not bring far pieces with it.** Step 3 gathers all pieces of a name, but the 120 km rule then drops distant ones. In the prototype Athens showed Greece and Crete, not the colonies abroad, and the owner did not object.

**Limits accepted.** A very large province (Siberia, the Sahara) can exceed 800 km when clicked inside. Shapes can jump when the slider crosses between datasets or snapshots. Measured coverage of 3,000 random land clicks by a named region, testing each dataset at the year shown:

| Year | Cliopatria alone | Basemaps alone | Both |
|---|---|---|---|
| 2000 BCE | 1% | 84% | 84% |
| 500 BCE | 6% | 79% | 80% |
| 100 CE | 14% | 65% | 68% |
| 1000 | 22% | 73% | 77% |
| 1500 | 32% | 81% | 82% |
| 1800 | 55% | 79% | 82% |

The remaining 16 to 32% get the modern country. Non-state labels very likely make up much of the older basemaps figures, and any name the owner strikes lowers them.

### 3.7 Opening state

The range opens at 500 BCE to 300 BCE, not "all time" (*My call:* under the rule above, "all time" would make every first click outside a story's provinces a modern country, which is the least interesting thing the app can show). The camera opens on the whole globe.

## 4. Stories

### 4.1 Stories are separate from outlines (*Owner*)

Each of the twenty keeps its place, range, id, frozen input and approved text, apart from section 4.3. A click always gets the ordinary outline from section 3.6: a click on Athens at 500 to 300 BCE shows the Greek city-states, capped at 800 km, and the story stays about Athens. Nobody picks provinces by hand, and there is no outline table for the owner to veto.

Most clicks show an outline and event list with no story, and the owner has accepted that (*Owner:* "keep the 20 stories").

### 4.2 Reaching a story

**A story's provinces** (*Owner*) are the provinces holding its cited items, computed at publish time and identified by Natural Earth's `adm1_code` (measured: 4,596 provinces, every code present and distinct). Publishing fails if a cited item has no province. Measured on the twenty: 14 cited items sit outside every province, all within 2 km of one, so the snap in section 5.2 places them.

**From a click** (*My call,* told to the owner). A click in a story's province opens the story when the overlap of the two ranges covers at least half of the chosen range or at least half of the story's years. The range then moves to the story's exact years with the date animation. If several stories match, take the smallest set of provinces, then the lower id. No two stories share a province in overlapping years, so this only fires on very wide ranges: at "all time", the province of Baghdad matches both Babylon (3 provinces) and Baghdad (2), and Baghdad wins.

**From the slider** (*My call,* told to the owner). Dragging never runs the check above. The one exception is landing on a story's exact years with the stored point in one of its provinces, which shows the story again. A story shows only while the range equals its exact years, so moving the range hides it and the panel follows section 3.6 for that point. Re-clicking brings it back.

**From the Stories list.** Choosing an entry selects the story's stored point, sets its exact years and flies there, as if the slider had landed on them.

**The stored point** (*My call; differs from the handoff's recommendation*). Each story's point is the location of its most notable cited item (by sitelinks) in the province holding the most cited items, computed at publish time. The current cell's centre was the proposal, and it fails: for Carthage it falls in Bizerte, for Jerusalem in Karak in Jordan, and for Baghdad in Babil, all outside the story's own provinces, so a Stories entry could not find its own story. Two more centres, Constantinople and Mombasa, fall outside every province. The rule used here lands every story on its place (Hannibal at Carthage, Josephus in Jerusalem, Baghdad itself), needs no H3 at all, and so does not depend on the order of the removal in section 5.1.

**Long ranges** (*My call*). Five stories span more than 500 years: Babylon (2000), Lhasa (1350), Carthage (700), Seoul (520) and Baghdad (510). Under step 1 they would get a modern country. While a story shows, step 1 does not apply: its outline comes from steps 2 to 4 for its own years, with `y` the middle of them. Without this, the longest stories would be the only ones that lose the product's main idea.

**The guard stays.** A story whose citations are not all in the panel is hidden with a `console.warn`.

Measured result for all twenty, at each story's point and exact years:

| Story | Years | Its provinces | Outline name |
|---|---|---|---|
| Babylon | 2500 to 500 BCE | Babil, Baghdad, Diyala | Babylonia (atlas) |
| Carthage | 800 to 100 BCE | Tunis, Manubah, Ben Arous | Carthage (Cliopatria, at the province point) |
| Athens | 500 to 300 BCE | Attiki | Greek city-states (atlas) |
| Rome | 100 BCE to 100 CE | Roma | Roman Empire (Cliopatria) |
| Jerusalem | 1 to 150 | Jerusalem, HaDarom, West Bank, Balqa, Madaba | Roman Empire (Cliopatria) |
| Medina | 570 to 700 | Al Madinah | Hejaz (atlas) |
| Lhasa | 600 to 1950 | Xizang | Tibet (atlas) |
| Baghdad | 750 to 1260 | Baghdad, Diyala | Buwayhid Emirates (atlas) |
| Tenochtitlan | 1300 to 1600 | Distrito Federal | Mexihcah (Triple Alliance) (atlas) |
| Seoul | 1390 to 1910 | Seoul | Joseon (Cliopatria) |
| Constantinople | 1400 to 1500 | Istanbul | Ottoman Empire (atlas) |
| Cusco | 1400 to 1600 | Cusco | Inca Empire (atlas) |
| Kyoto | 1450 to 1650 | Kyōto, Shiga | Ashikaga Shogunate (Cliopatria) |
| Mombasa | 1490 to 1900 | Coast | Kenya, modern borders |
| Panipat | 1500 to 1800 | Haryana | Mughal Empire (Cliopatria) |
| Port-au-Prince | 1750 to 1810 | Ouest, Sud-Est | New France (Cliopatria) |
| Paris | 1789 to 1815 | Paris | France (atlas) |
| Isandlwana | 1870 to 1900 | KwaZulu-Natal | Zululand (Cliopatria) |
| Beijing | 1900 to 1990 | Beijing | China (atlas) |
| Gallipoli | 1914 to 1918 | Çanakkale | Ottoman Empire (Cliopatria) |

The names were measured on the raw datasets with 32 of the 54 basemaps snapshots on hand, including the nearest one for each story. The shapes were not built. "New France" over Haiti is Cliopatria's own label.

### 4.3 What changes in the text (*Owner:* only sentences stating local counts)

Every story was read. 19 of the 20 cite `C` (all but Isandlwana), but only 15 state a local count. Carthage, Rome, Constantinople and Cusco cite `C` only for "Some locations in this account are approximate", so those four and Isandlwana do not change at all.

| Story | Sentence | Now | Change (*My call*) |
|---|---|---|---|
| Babylon | 1 | "Only 8 events are documented here, and some locations in this account are approximate." | Keep placement only |
| Athens | 1 | "Only 8 events are documented here, with 59 people and places, and some locations in this account are approximate." | Keep placement only |
| Jerusalem | 1 | "This area has 10 documented events, and some locations in this account are approximate." | Keep placement only |
| Medina | 1 | "Only 8 events and 44 people and places are documented here, and some locations in this account are approximate." | Keep placement only |
| Lhasa | 1 | "Some locations in this account are approximate, including all 8 documented events." | Keep placement only, without the number |
| Baghdad | 1 | "Only 8 events are documented here, along with 55 people and places, and some locations in this account are approximate." | Keep placement only |
| Tenochtitlan | 1 | "This area has 10 documented events, and some locations in this account are approximate." | Keep placement only |
| Seoul | 1 | "Only 10 events are documented here, along with 49 people and places, and some locations in this account are approximate." | Keep placement only |
| Mombasa | 1 | "Only 5 events and 2 people and places are documented here, so this account is short, and 4 of the 5 events have approximate locations." | Keep placement only |
| Beijing | 1 | "This area has 18 documented events; 12 are told here, and some locations are approximate." | Keep placement only |
| Kyoto | 1 | "This account draws on the most notable of the 27 documented events here." | Delete; sentence 2 keeps placement |
| Panipat | 1 | "Only 3 events and 1 place are documented here, so this account is short." | Delete; nothing cited is approximate |
| Port-au-Prince | 1 | "Only 8 events and 3 people and places are documented here, so this account is short." | Delete; sentence 2 keeps placement |
| Paris | 1 | "Of 41 documented events here, only the most notable appear." | Delete; sentence 2 keeps placement |
| Gallipoli | 1 | "Of the 23 documented events here, this account follows 12 of them." | Delete; sentence 3 keeps placement |

Read and left alone: Beijing sentence 3 ("Only the Treaty of Peking's name and year, 1905, are documented here") describes one item, not a count. "Born here" and "dated here" stay true, because the outline always contains the provinces of the items they cite.

**Process (*Owner*).** Each of the fifteen goes through a fresh writer, the checker, and a fresh reviewer, and the owner reads the results at the gate. The writer gets `stories/RULES.md`, the input, the current story, and the sentence to change, and changes only that sentence. Every other sentence must stay byte for byte, confirmed by comparing against the last commit. The reviewer judges the changed sentence. Anything it finds elsewhere goes in the gate report for the owner, not into an edit. Inputs are not re-frozen and the rest of the text is not rewritten.

**`stories/RULES.md` becomes `rulesVersion` 3** (*My call*). Version 2 tells a writer to state counts ("When the box has few events, say so plainly, citing `C`") and shows one in its example, the opposite of this section. Version 3 replaces that with: do not state how many events, people or places are documented here, because the panel lists a wider region; the numbers in `C` describe an earlier, smaller area and are not to be repeated; never pad. The fifteen carry version 3; the five unchanged stories keep version 2, since nobody rewrote them.

**A guard test** (*My call*). `tests/stories.test.ts` gains one assertion: no sentence citing `C` contains a number. `lib/narrative/check.ts` does not change.

### 4.4 What the panel lists for a story (*Owner*)

The panel lists the region's events and always includes the story's cited items, appended if they fall outside the top N, so every citation marker works. This extends the existing `focus` lookup in `lib/db/area.ts` from one qid to the story's list. The `C` marker keeps scrolling to the Events heading. "And N more" counts what is not shown.

## 5. How it is built

### 5.1 What goes

Remove, with their tests: the H3 grid, `h3-js` (dependency and the four `h3_*` columns and their indexes), `/api/cells`, `/api/events`, dots, stacks, the hover web (`app/ui/DotWeb.tsx`, `lib/dots.ts`, `lib/web.ts`, `lib/cells.ts`, `lib/db/cells.ts`, `lib/db/events.ts`, `etl/bench-cells.ts`, `etl/bench-events.ts` and their npm scripts), `etl/story-input.ts`, and `FeaturedList` as it stands. *Builder's call:* whether anything in `lib/box.ts` survives. Run `npm run etl:load` after the schema change. Trust the compiler and tests to find the rest.

### 5.2 Data

Fetched by a new `etl/` script into `data/raw/` (gitignored), never committed, resolved by URL plus a pinned commit or release recorded in the code. Validate external data with zod and save a small fixture per source, per the working agreements.

| Source | Use | License |
|---|---|---|
| Natural Earth `ne_10m_admin_1_states_provinces` (4,596 provinces, 40 MB) | The building block of every outline | Public domain |
| Cliopatria, `Seshat-Global-History-Databank/cliopatria` (13,797 rows, per-year, with Wikidata ids; 173 MB unzipped; version v021 tested) | Steps 2 and 4 | CC BY 4.0 |
| Historical-basemaps, `aourednik/historical-basemaps` (54 snapshots, 3000 BCE on) | Step 3 | GPL-3.0 |

New tables in `data/chronoglobe.db`, loaded by `etl:load`:

- `provinces`: id (`adm1_code`), name, country, representative lon and lat, bbox, area, GeoJSON.
- `regions`: id, source, name, from_year, to_year, area, wikidata (nullable), bbox, GeoJSON. Basemaps snapshots become year ranges here, so one query serves both sources.
- `events.province_id`, nullable.

Years are converted to our no-year-zero convention on load (`lib/time`). Cliopatria's `RELATION` rows and names in parentheses are not used for selection; the builder confirms from its README what they mean. Skip basemaps files older than the app's range.

**Assign each event to a province at load**, using its point: about 34 s for all rows, measured unoptimised. 3.6% of all rows and 7.7% of the event kinds fall outside every province (likely including sea battles and coastal points). Snap those to the nearest province within about 150 km; report how many stay unassigned and accept them. *Builder's call:* the exact distance, after looking at what it catches (Salamis should land in its province).

**The owner reviews the names before anything ships** (*Owner*). `etl:load` writes the full list of distinct basemaps names to `docs/region-names.md`, largest total area first, with each name's years. The owner's strikes go in `etl/struck-names.json`, which `etl:load` honours, so a struck name stops matching in step 3 and the click moves down the rule, in practice to the modern country. *Cost, stated plainly:* the 32 of 54 snapshots on hand already hold 2,761 distinct names, so the full list is at least that long. Sorting by area puts the names most people will see first.

**Measure the database size after loading** and report it. If `regions` makes it impractically large, simplify at load. Phase 7 has to ship this file.

### 5.3 Merging provinces into an outline (no new dependency)

Cancelling edges that appear twice across the selected provinces leaves exactly the outer boundary. Tested on raw Natural Earth data, including across countries: no open chains, in under 35 ms for 123 provinces. Walk the remaining edges into rings; the fill uses the same rings. Simplify rings only after merging, never before: simplifying provinces first is what caused the stray dashes in the prototype.

No geometry library is needed: point in polygon, distance, area and edge cancelling are short pure functions in `lib/`, each unit-tested. The prototype's use of turf stays in the prototype. Ask the owner before adding any dependency.

### 5.4 API

`GET /api/area` changes from a cell to a point: `lat, lon, from, to, intent`, validated with zod. `intent` is `click` (run the check in 4.2) or `range` (a drag or a Stories entry: only an exact match shows a story). It returns:

- `selection`: kind `historical | modern | none`, name, source, scale facts, outline GeoJSON.
- `story`: the story id or null, with the `from` and `to` actually used, which differ from the request when a click moved the range.
- The existing `events`, `eventsTotal`, `others`, `othersTotal` lists, queried by `province_id IN (...)` plus year overlap, plus cited items (4.4). The sort order and limits (25 and 30, "and N more") stay.

Target: a click answers in under 150 ms on the worst case in `etl/` terms, and the outline payload stays small enough to feel instant. Step 2 reads many rows for a wide range, so measure that case on the database. Consider an R*Tree on region bboxes only if the measurement calls for it (standing rule).

Stale answers and errors keep the current handling; an error shows a plain line in the panel.

### 5.5 Story files (*My call,* except where marked)

- **`stories/featured.json`** loses `cell` and gains nothing: id, place, from, to.
- **`stories/published.json`** gains `point` and `provinces` per story. `etl/story-publish.ts` now needs the database: it computes both from the cited items (a pure, tested function) and passes them to `publishStories`.
- **`tests/stories.test.ts`** has no database, so it takes `point` and `provinces` from `published.json` and verifies everything else as it does today. `story:check` is what compares them with the database.
- **The publish check** that binds a story to its entry stays and compares id, from and to. Frozen inputs have no provinces, so provinces cannot be part of it.
- **`storyFor`** becomes a pure function of province, range and intent, and is tested on the cases in 4.2.

**Frozen inputs stay byte for byte, and their `entry.cell` stays.** `StoryInputSchema` gets its own entry shape in which `cell` is a plain string with no H3 check: a record of where the input came from, read by nothing. Removing the field would change twenty approved files for no gain.

**`etl/story-input.ts` is removed, with `npm run story:input`, `buildStoryInput` and `contextText`.** It queries by cell, no more stories are planned, and a ported version would be untested code with nothing to run on. `sourceText` stays because the checker uses it. A future twenty-first story needs a new generator designed around provinces, and `docs/decisions.md` says so.

**`npm run story:check` is rewritten around cited items.**
- Stale, exit 1: a cited qid no longer exists; its label or years text differs from the frozen input (kept from today); it no longer has a province.
- Out of date, exit 1, fixed by `npm run story:publish`: the `point` or `provinces` recomputed from the database differ from `published.json`.
- Warning only: a cited item's location confidence changed (kept from today).
- **Removed, not replaced:** regenerating the `C` sentence and the "input drift" warning. Both compared the frozen input with a fresh query of the old cell, and that area no longer exists; `C` is now frozen history. The placement sentences it supports depend on cited items, which the location confidence warning already covers.

## 6. Acceptance

1. A stranger opens the app and sees a cream globe with no names, grid or dots.
2. Zooming shows names in the groups of 3.3. Panning at one apparent zoom from Africa to Europe keeps country names on, tested with a real drag.
3. A click in Attica at 450 to 350 BCE opens the Athens story, moves the range to exactly 500 to 300 BCE with the date animation, outlines the region named by 3.6, and every citation marker scrolls to a listed item. A click in Attica at 1000 to 1100 shows the outline and lists with no story. A click in Thessaly at 500 to 300 BCE shows the outline and lists for that click with no story.
4. A click on Jerusalem at 1 to 150 CE outlines an area no wider than 800 km from the click, solid and continuous, with no dashes or stray fragments.
5. For a sample of at least 30 clicks across eras and continents, the outline is continuous, the name and scale show, and every listed item's province is inside the outline.
6. The panel slides, the globe glides, dates count, and reduced motion makes it all instant.
7. A range over 500 years outlines the modern country and says "modern borders", unless it is a story's exact years.
8. All twenty stories pass the checker in `npm test`. The fifteen in 4.3 differ from the last commit only in the sentence listed; each has a reviewer pass with findings resolved, and the owner reads them at the gate. The other five are byte-identical. No sentence citing `C` contains a number.
9. Every Stories entry opens its own story at its exact years, and every citation marker works, by mouse and keyboard.
10. Dragging the slider never opens a story unless the range lands on its exact years; moving away hides it.
11. A historical outline says it is approximate and built from modern provinces, and a basemaps name shows the atlas line.
12. The owner has read `docs/region-names.md`, and every struck name falls back as 5.2 says.
13. `npm run story:check` passes. Tests, typecheck, lint and build pass. No console errors. No em or en dashes in docs, stories or code outside frozen source text.
14. The hexagon grid, dots and `h3-js` are gone from the code and `package.json`.

## 7. Docs and licensing

- **`CLAUDE.md`:** the opening paragraph (no dots; clicking reveals an outline); status line; key decision 3 (superseded: no viewport queries); non-goals (remove "historical borders": *Owner* asked for era outlines, which reverses it, but keep the warning that these are not authoritative maps); the emptiness risk (the grid is gone; the blank globe plus plain empty messages replace it); stack (`h3-js` out); repo layout; schema block; licensing.
- **`docs/PLAN.md`:** Phase 6 becomes a pointer here; the play button and heat layer are recorded as dropped by the owner; the definition of done is updated.
- **`docs/decisions.md`:** a new entry with the reasons, the measurements in this document, and the dataset comparison, including that Cliopatria alone was recommended and then overturned by measurement, that the midpoint test gave way to the held test, and that a new story needs a new input generator.
- **`stories/RULES.md`:** `rulesVersion` 3 (section 4.3).
- **`docs/superpowers/specs/2026-10-29-featured-stories-design.md`:** a note at 4.2, 6.2 and 6.7 pointing here.
- **`README.md`:** ETL steps, sources, attributions, and the `story:publish` and `story:check` order after `etl:load`.
- **Attribution in the UI and README:** add Cliopatria (CC BY 4.0, with a link to the license and a note that shapes are processed), historical-basemaps (GPL-3.0), Natural Earth (public domain), alongside the existing sources.
- **GPL-3.0 (*Owner:* accepted):** once the app is public, the processed outline data derived from historical-basemaps must be available under GPL-3.0 with credit. As far as the writer understands, the app's own code is a separate work, but this is not legal advice. Phase 7 must plan for it; nothing is public before then.

## 8. Left to the builder

Component structure and how `GlobeApp` and `GlobeMap` are reshaped; commit split; easing curves; the panel's exact spacing; where attribution sits; the exact radius, small-piece and snap numbers within the spirit above once real data shows what they do. Anything that changes what the user sees beyond section 3 goes back to the owner.
