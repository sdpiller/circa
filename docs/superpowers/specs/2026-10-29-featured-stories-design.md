# Featured stories: design (Phase 5, revised)

Date: 2026-10-29. Status: approved and built, see decisions.md entry 30. Replaces the Phase 5 text in `docs/PLAN.md` and section 3.3's `POST /api/area/story` in `docs/superpowers/specs/2026-10-29-area-panel-design.md`. Read `CLAUDE.md`, that spec (sections 2.2 and 2.3), and `docs/decisions.md` entries 28 and 29 first; their conventions hold unless this document says otherwise.

## 1. Intent

The story at the top of the area box is what makes Chronoglobe more than a marker-and-slider map (decision 28). The original Phase 5 wrote it live with the Claude API on each click. The owner has no budget for API calls, so nothing is generated at request time.

Instead, about 20 stories are written offline, during Claude Code sessions (the owner's existing plan, no API credit), for chosen places and eras. They ship as committed files. A "Featured stories" list in the app takes the user to each one: it sets the year range, moves the globe to the cell, and opens the box with the story on top. Every other selection shows the box as Phase 4 built it.

The grounding rules do not relax because the writer is a Claude Code session instead of an API endpoint. Every shipped story is checked mechanically against a frozen copy of its input, reviewed by a fresh reviewer that sees only the input and the story, and read by the owner at the gate.

## 2. Decisions already made (owner, 2026-10-29)

- No live generation and no API spend. No Anthropic SDK, no `ANTHROPIC_API_KEY`, no rate limiter, no story endpoint.
- Twenty featured stories, chosen by the builder from the data (section 5). The owner vetoes picks when approving this document; after approval the list is fixed unless a pick's input proves unusable (section 5, last paragraph).
- Story input: the cell's top 12 events (kinds `event` and `discovery`) plus top 5 people and places, by sitelinks with ties by qid (as `queryArea` orders them), each with its English Wikipedia extract fetched through the existing `getSummary`, or its Wikidata description when there is no article.
- A story is only written for a cell with at least 3 events in its range.
- The story does not restate the scale or the year range; the box header already shows both.
- Every sentence is cited; clicking a citation scrolls to and highlights the cited item in the box's list.
- The story credits Wikipedia and Wikidata.
- Strictness: a story that fails any check is not shipped. Fixes go into the story text, never into the checker.

## 3. Goals, non-goals, anti-goals

**Goals.** Twenty stories that read as short, plain, chronological history of a place, every statement traceable to a cited item. A stranger can open the app, pick "Athens, 500 to 300 BCE" from the Featured list, and read a cited story within a second. The list spans eras and continents, not just the Mediterranean.

**Non-goals.** Stories for arbitrary selections; generating anything at request time; per-user or translated stories; a story that adapts when the range or cell changes; Phase 6 fly-to polish beyond what Featured needs.

**Anti-goals (failure even if it works).** A story that states a name, number, date, or causal link not present in its input. A story shown for a cell or range it was not written for. A sparse place padded to look rich. A featured list that hides the coverage bias by featuring only well-documented regions.

## 4. What the user sees

### 4.1 The Featured list

A collapsible "Featured stories" section in the left panel (under the title, above the dot toggle). *My call: placement; it must not cover the globe on a 1280 by 800 screen.* Each entry reads "Athens, 500 to 300 BCE" (place name, then `formatRange`). Entries are ordered by start year. A one-line note under the heading: "Written by Claude from the Wikipedia and Wikidata text of each area. Other areas show their lists only." *My call: wording.*

Choosing an entry:
1. Sets the range to the entry's exact `from` and `to`.
2. Moves the camera so the entry's cell is in view at a zoom where the grid draws that cell's resolution (inside the `RES_BANDS` band for it) and the cell is not under the box. *Builder's call: the zoom inside the band and whether the move animates; reuse the existing occluder pan if it composes cleanly.*
3. Selects the cell (the existing outline highlight) and opens the box.

Keyboard: the list is a list of buttons; Enter on an entry does the same as a click.

### 4.2 The story in the box

When the box's cell and range exactly equal a featured entry's `cell`, `from`, and `to`, the story appears between the header and the Events heading, whatever way the user got there (Featured list or a manual click with the same range). Otherwise there is no story section at all; the box is unchanged from Phase 4.

The Featured list is the reliable way to a story. The slider cannot land exactly on most featured years (13 of the 20 ranges have an endpoint such as 1789 or 1390 that no slider position produces), so once the user nudges the range, the way back is the list. *My call: accepted. Moving featured ranges to slider-reachable years would cut real events (Paris would lose 1789), and snapping the slider is a UI change nobody asked for.* The range readout must show the exact featured years after a Featured choice, not the nearest slider years.

- **Text:** the story's sentences as one or two paragraphs (the story file decides the breaks).
- **Citations:** after each sentence, one small marker per cited item. Each marker is a button. Its accessible name and tooltip are the cited item's label. Activating it scrolls the box to that item in the Events or People and places list and highlights it with the existing `focused` style. *Builder's call: marker look (numbers or short labels); must work by keyboard.*
- **Credit line** under the story: "Written by Claude from the Wikipedia (CC BY-SA) and Wikidata text of the items cited. Featured story, 2026-10-29." with links to Wikipedia and Wikidata. *My call: wording.*
- **Range change:** if the user moves the range while a featured box is open, the story disappears at once (the box refreshes its lists as it already does). Returning to the exact range brings it back.
- **Guard:** the story is shown only if every cited qid appears in the box's current `/api/area` response. If any is missing (for example after a database rebuild), the story is hidden and a `console.warn` names the story id and the missing qids. Never show a story whose citations cannot be clicked through.

## 5. The twenty (builder's picks, owner may veto)

Measured on the current database (255,475 rows). Events = kinds `event` and `discovery` overlapping the range; "with article" = has an English Wikipedia title; "inherited" = location borrowed from a parent place; "others" = people and places.

| id | Place | From | To | Res | Cell | Events | With article | Inherited | Others |
|---|---|---|---|---|---|---|---|---|---|
| babylon | Babylon | -2500 | -500 | r3 | `832ca2fffffffff` | 8 | 6 | 5 | 6 |
| carthage | Carthage | -800 | -100 | r3 | `83386efffffffff` | 14 | 11 | 3 | 11 |
| athens | Athens | -500 | -300 | r5 | `851eda77fffffff` | 8 | 4 | 5 | 59 |
| rome | Rome | -100 | 100 | r5 | `851e8053fffffff` | 9 | 7 | 4 | 83 |
| jerusalem | Jerusalem | 1 | 150 | r3 | `832db2fffffffff` | 10 | 6 | 6 | 6 |
| medina | Medina | 570 | 700 | r3 | `835311fffffffff` | 8 | 8 | 2 | 44 |
| lhasa | Lhasa | 600 | 1950 | r5 | `853c7277fffffff` | 8 | 8 | 8 | 21 |
| baghdad | Baghdad | 750 | 1260 | r4 | `842ca2bffffffff` | 8 | 6 | 5 | 55 |
| tenochtitlan | Tenochtitlan | 1300 | 1600 | r5 | `854995bbfffffff` | 10 | 7 | 5 | 20 |
| seoul | Seoul | 1390 | 1910 | r4 | `8430e1dffffffff` | 10 | 10 | 8 | 49 |
| constantinople | Constantinople | 1400 | 1500 | r5 | `851ec903fffffff` | 9 | 6 | 5 | 19 |
| cusco | Cusco | 1400 | 1600 | r3 | `838b61fffffffff` | 16 | 7 | 10 | 8 |
| kyoto | Kyoto | 1450 | 1650 | r4 | `842e615ffffffff` | 27 | 7 | 10 | 41 |
| mombasa | Mombasa | 1490 | 1900 | r3 | `837b59fffffffff` | 5 | 5 | 4 | 2 |
| panipat | Panipat | 1500 | 1800 | r5 | `853d12cffffffff` | 3 | 3 | 0 | 1 |
| port-au-prince | Port-au-Prince | 1750 | 1810 | r3 | `836725fffffffff` | 8 | 6 | 2 | 3 |
| paris | Paris | 1789 | 1815 | r5 | `851fb467fffffff` | 41 | 26 | 31 | 135 |
| isandlwana | Isandlwana | 1870 | 1900 | r3 | `83bcf1fffffffff` | 11 | 10 | 0 | 1 |
| gallipoli | Gallipoli | 1914 | 1918 | r3 | `831ecafffffffff` | 23 | 21 | 3 | 0 |
| beijing | Beijing | 1900 | 1990 | r5 | `8531aa43fffffff` | 18 | 14 | 14 | 73 |

Spread: Africa 3 (Carthage, Mombasa, Isandlwana), Middle East 4, Europe 5, Asia 5, Americas 3. Eras from 2500 BCE to 1990.

Deliberate stress cases, each also a real story:
- **athens:** the famous neighbours (Salamis, Marathon) and most famous buildings are in other cells, and half its events have no article. A writer who knows Athens will be tempted to add them. Also the plan's definition-of-done case.
- **panipat:** exactly 3 events (the threshold). The story must be short and say plainly how little is documented.
- **lhasa** and **paris:** most or all locations inherited; the story must note approximate locations.
- **kyoto:** 27 events, only 7 with articles. Most input is a label and a one-line description.
- **mombasa:** 5 events across four centuries; sparse and must read as sparse.

**Places tested and dropped for having fewer than 3 events in any sensible cell and range:** Timbuktu, Great Zimbabwe, Aksum, Teotihuacan, Angkor, Giza, Knossos, Benin City, Tikal, Varanasi, Lagos, Kano, Hiroshima (1939 to 1950). This is the coverage bias from CLAUDE.md, measured. Record it in decisions.md; do not hide it.

If the frozen input for a pick turns out unusable (for example the top items are all one kind of near-duplicate), replace it with another place in the same region and era and say so at the gate.

## 6. How a story is made

### 6.1 Files

- `stories/featured.json`: the list from section 5 (id, place, from, to, cell). The source of truth for what is featured.
- `stories/inputs/<id>.json`: the frozen input. Generated by a script, committed, never edited by hand. Never shipped to the browser.
- `stories/<id>.json`: the story. Small; this plus `featured.json` is what the app loads.

*Builder's call: how the app loads the story files (static import into the client, or a small server route reading them). Inputs must not end up in the client bundle.*

### 6.2 Input format (`stories/inputs/<id>.json`)

- Entry fields (id, place, cell, from, to), `generatedAt`, and the database row count it was built from.
- `items`: up to 17 entries, events first (refs `E1` to `E12`, numbered in the order the box lists events: by year), then people and places (`P1` to `P5`, by sitelinks). Each has: `ref`, `qid`, `label`, `kind`, `description` (Wikidata, may be null), `years` (the text `formatRange` shows, for example "430 to 426 BCE"), `start_year`, `end_year`, `loc_confidence`, `wikipedia_title`, and `extract` (the full plain-text Wikipedia extract, or null when there is no article or the summary is missing).
- `eventsTotal` and `othersTotal` from the area query, so the writer knows whether the 12 are all there is.
- A context item with ref `C`, whose source text the script generates from the data: "This area has N documented events and M documented people and places in this range. K of the listed events have approximate locations." Sentences about the area as a whole (how little is documented, approximate placement) cite `C`, so they pass the same checks as any other sentence.
- For every item with an inherited location, its source text (6.6) includes the words "approximate location", so a sentence saying so is supported by the item it cites.

Generated by `npm run story:input -- <id>` using `queryArea` and `getSummary` with the cache in `data/cache.db`. It needs `WIKIMEDIA_CONTACT`. It refuses to overwrite an input that already has a story, unless `--force` (then the story must be rewritten and re-reviewed).

### 6.3 Story format (`stories/<id>.json`)

`id`, `rulesVersion` (see 6.4), `writtenAt`, `writtenBy` (for example "Claude Opus 5.5 in Claude Code"), and `paragraphs`: an array of paragraphs, each an array of sentences `{ text, cites }`, where `cites` is a non-empty array of refs from the input. Sentence text holds no citation markers; the app draws them from `cites`.

### 6.4 Writing rules (`stories/RULES.md`, versioned as `rulesVersion`)

Adapted from PLAN.md Phase 5:
- Use only the input. No names, numbers, dates, places, or causal links that the input does not state. Copy numbers and dates as the input gives them; do not compute new ones ("a decade later", "the 5th century").
- 60 to 250 words, chronological, plain prose, no headings or lists. Short is fine when the input is thin.
- Every sentence cites at least one ref, and every statement in a sentence is supported by the text of the items that sentence cites.
- Do not restate the area size or the year range.
- Where cited items have inherited locations, say so once per story, in one sentence (owner decision, 2026-10-30, `rulesVersion` 2; it replaced a per-event note that read as a tic). The box marks each item.
- People and places: state their tie to this area (born here, founded or built here, as the kind says). Their later deeds happened elsewhere unless their text says they happened here; do not tell them as if they happened here.
- Keep to what happened inside the range. Something an extract mentions outside it may be left out, or named as earlier or later.
- When the box has few events, say so plainly, citing `C`. Never pad.
- No em dashes or en dashes (CLAUDE.md style rule).

### 6.5 Writing and review process (per story)

1. Generate the input (6.2).
2. **Writer:** a fresh subagent given only `stories/RULES.md` and the input file writes the story file. Not the main session, which holds the research and the place's history in context. (It still has the model's general knowledge; the checks below are what contain it.)
3. **Checker** (6.6) must pass. On failure the writer revises the text.
4. **Reviewer:** a second fresh subagent given only the rules, the input, and the story checks each sentence: is every statement supported by the text of its cited items, are people's deeds placed correctly, is anything implied that the input does not say. Its findings are fixed in the story, then the checker runs again.
5. Commit the input and the story together. The review notes go in the gate report, not the repo.

### 6.6 The checker (`lib/narrative/`)

Pure functions, unit-tested, run on every committed story inside `npm test` (no database or network needed: it reads the story and its input).

1. **Shape** (zod): fields present, at least one sentence, every `cites` non-empty, every ref exists in the input, word count 60 to 250, no em dash (U+2014) or en dash (U+2013).
2. **Numbers**, per sentence: every run of digits in the sentence must appear in the source text of that sentence's cited items (label, description, years text, extract). Before matching, normalise thousands separators and eras ("BC" to "BCE", "AD n" and "n AD" to "n CE"). A number the story marks with an era must appear in the source with the same era, so "430 CE" never passes against "430 BCE". Spelled-out numbers from "one" to "twenty" and "dozen" are read as digits and checked the same way, so a number cannot slip past the check by being spelled. Larger number words ("hundreds", "thousands", "million") must appear as words in the cited source text.
3. **Names**, per sentence: every capitalised word must appear, as a whole word ignoring case, in the cited items' source text, or in one global committed allowlist. The allowlist is approved with this document and is: era and source words (BCE, CE, BC, AD, Wikipedia, Wikidata), the twelve month names, and generic words that start sentences (A, An, The, In, On, At, By, For, From, To, Of, After, Before, During, Later, Earlier, Over, Under, Between, Among, Around, Within, With, While, When, Although, Here, There, This, That, These, Those, It, Its, They, Their, He, His, She, Her, Only, Most, Some, Several, Both, Few, Little, Much, Many, No, Nothing, None). No proper nouns or demonyms, ever. The allowlist is global, never per story; adding to it needs the owner's sign-off.
4. Scope note: checking per sentence against the cited items (not against the whole input) also catches a true fact cited to the wrong item. *My call: stricter than PLAN.md's whole-input check; loosen to whole-input only with the owner's agreement if it proves unworkable, and say so.*

Checker tests: one passing fixture, and one failing fixture per failure class (unknown ref, uncited sentence, invented number, wrong era, invented name, fact cited to the wrong item, too long, em dash), each asserting the specific failure.

What the checker cannot catch, and who covers it: relocated deeds, wrong relationships between correct names, invented causal links, "a decade later", "a century later", "twice", names written in lowercase, and an ordinal against a cardinal (3rd against 3). The reviewer (6.5 step 4) and the owner's read at the gate.

### 6.7 Staying current after a rebuild

- `npm run story:check` (needs the database): for each featured entry, re-run the area query and confirm every cited qid is still in the box's lists for that cell and range, and that each cited item's label and years text are unchanged. Any failure makes the story stale: it prints the story id and reason and exits non-zero. Ranking drift is not staleness: if new or re-ranked items would change the top 17, it prints an "input drift" warning but passes, because the story is still true about what it cites. `story:check` also warns, without making a story stale, on a changed context sentence or location confidence. Extracts are not compared (that would need the network). *My call: a routine rebuild should not force twenty rewrites.* Run after `etl:load`; mention it in the README's ETL section.
- The runtime guard in 4.2 keeps a stale story off screen until it is rewritten.

## 7. Changes to existing code and docs

- **Dropped:** the `narratives` table in `lib/db/schema.ts` and its carry-over in `etl/load.ts` (with their tests). Nothing caches stories at runtime, so there is no table at all, in either database.
- **`.env.example`:** remove `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.
- **CLAUDE.md:** the opening paragraph (stories for featured places, written offline and grounded only in their items); key decisions 4 (keep the principle, apply it to offline writing) and 7 (superseded: no runtime generation, no cache); the "Hallucinated narratives" risk (mitigation is the checker, reviewer, and owner read); Stack (Anthropic SDK no longer used); repo layout (`/app/api/area` is GET; `/lib/narrative` is the checker; add `/stories`); schema block (no `narratives` table); status line at the gate.
- **PLAN.md:** Phase 5 replaced by a pointer to this document; Phase 7 loses the "protect the narrative endpoint" line; the definition of done becomes "pick Athens, 500 to 300 BCE from Featured (or select that cell and range by hand) and read a cited, accurate story".
- **Area panel spec:** a note at 3.3 that `POST /api/area/story` is superseded by this document.
- **decisions.md:** a new entry: no budget, so offline featured stories; what was dropped (live generation, SDK, cache, rate limit); the item-based cache key the owner approved, now moot; how stories are written and verified; the stricter per-sentence check; the measured coverage gaps from section 5.

## 8. Acceptance

1. Twenty stories and their inputs are committed; every one passes the checker in `npm test`.
2. The checker's unit tests show it catching each failure class in 6.6.
3. Every story has a reviewer pass with its findings resolved, summarised in the gate report.
4. Each Featured entry sets the range, brings its cell into view outside the box, selects it, and shows the story on top.
5. Every citation marker scrolls to and highlights the right item, by mouse and keyboard.
6. Moving the range hides the story; returning to the exact range shows it again. A manual click on a featured cell with a different range shows no story.
7. `npm run story:check` passes against the current database.
8. No console errors; tests, typecheck, and lint pass.
9. The owner reads all twenty at the gate.

## 9. Left to the builder

Featured list styling and whether it starts open; citation marker look; camera zoom and animation; how story files reach the client; commit split. Anything that changes what the user sees beyond section 4 goes back to the owner.
