# Featured Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship twenty offline-written, mechanically checked, cited stories that appear at the top of the area box for their exact cell and range, reached from a Featured list.

**Architecture:** A script freezes each story's input (top 12 events and top 5 people and places from `queryArea`, with Wikipedia extracts) into `stories/inputs/`. Stories are written by fresh subagents into `stories/<id>.json`, checked per sentence by pure functions in `lib/narrative/`, and published into one `stories/published.json`, the only story file the app imports. The box shows a story when its cell and range match exactly and every cited item is in its lists.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, MapLibre GL 6, better-sqlite3, h3-js, zod 4, vitest 5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-featured-stories-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- No em dash (U+2014) or en dash (U+2013) in any prose, doc, comment, commit message, UI copy, or story.
- No new dependencies. No Anthropic SDK. No API key.
- Scripts run on Node directly (decision 12): `.ts` files, imports with explicit `.ts` extensions, no tsx.
- Years are signed historical integers (1 BCE = -1, no year 0); display text comes from `formatRange` / `formatYear` in `lib/time/index.ts`.
- Run `npm test`, `npm run typecheck`, and `npm run lint` before every commit. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A dev server, if started, uses port 3123 and is stopped before the task ends (an orphan holds `data/chronoglobe.db` open).
- Never hardcode Wikidata QIDs from memory. `stories/featured.json` holds cells; qids come from the database.
- A story that fails a check is fixed in its text, never by loosening the checker or the allowlist.
- Inputs (`stories/inputs/`) are never imported by app code.
- In code and tests, write the dash characters as `\u2014` and `\u2013` escapes, so the final dash scan stays clean.

## Review Focus

1. Choosing a Featured entry while the box is open on another cell and range: the box must show the new cell and range with its story, never the old range's answer. Pinned in Task 6 (manual check) and by `storyFor` exact-match tests in Task 5.
2. Moving the range by one slider step after a Featured choice: the story must disappear. Pinned in Task 5 (`storyFor` returns null for `from + 1`).
3. A database rebuild that drops a cited item: the story is hidden with a `console.warn`, nothing throws. Pinned in Task 5 (`missingCites`).
4. A sentence that cites only `C`: its marker must work (scroll to the Events heading), not throw or render nothing. Pinned in Task 5 (publish maps `C` to `qid: null`) and Task 6.
5. Names with diacritics, possessives, and hyphens ("Hernán", "Moctezuma's", "Anglo-Zulu"): the name check must tokenise Unicode letters and handle all three. Pinned in Task 3.

---

## File Structure

- `lib/narrative/types.ts`: zod schemas and types for featured entries, inputs, stories, published stories.
- `lib/narrative/input.ts`: pure `buildStoryInput` and `sourceText`.
- `lib/narrative/check.ts`: pure `checkStory` and its helpers.
- `lib/narrative/allowlist.ts`: the global name allowlist (spec 6.6 item 3, verbatim).
- `lib/narrative/publish.ts`: pure `publishStories`.
- `lib/narrative/stale.ts`: pure `staleness`.
- `lib/stories/catalog.ts`: client side: imports `stories/published.json`, exports `FEATURED`, `storyFor`, `missingCites`.
- `etl/story-input.ts`, `etl/story-publish.ts`, `etl/story-check.ts`: thin scripts.
- `stories/featured.json`, `stories/RULES.md`, `stories/<id>.json`, `stories/inputs/<id>.json`, `stories/published.json`.
- `app/ui/Story.tsx`, `app/ui/FeaturedList.tsx`; changes to `AreaBox.tsx`, `GlobeApp.tsx`, `GlobeMap.tsx`, `globe.module.css`, `lib/cells.ts`.
- Tests: `tests/narrative-input.test.ts`, `tests/narrative-check.test.ts`, `tests/narrative-publish.test.ts`, `tests/narrative-stale.test.ts`, `tests/stories.test.ts`, `tests/catalog.test.ts`, additions to `tests/cells.test.ts` and `tests/load.test.ts`.

---

### Task 1: Drop the narratives table and the Anthropic settings

**Files:**
- Modify: `lib/db/schema.ts` (remove the `CREATE TABLE narratives` block)
- Modify: `etl/load.ts` (header comment line about narratives; `writeDatabase` loses its `previous` parameter and the ATTACH block; the call at about line 120 stops passing it)
- Modify: `tests/load.test.ts:120-131`
- Modify: `.env.example` (remove the two `ANTHROPIC_*` lines and their comments)

**Interfaces:**
- Produces: `writeDatabase(path: string, rows: EventRow[], info: Record<string, string>): void`

- [ ] **Step 1:** Replace the test "carries cached narratives over from the previous database" with `it("has no narratives table", ...)`: write a database with one row, open it read-only, assert `db.prepare("SELECT name FROM sqlite_master WHERE name = 'narratives'").get()` is `undefined`.
- [ ] **Step 2:** Run `npx vitest run tests/load.test.ts`. Expected: the new test FAILS (table still exists).
- [ ] **Step 3:** Remove the table, the `previous` parameter and its block, and the comment; update the caller. Remove the `ANTHROPIC_*` lines from `.env.example`.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass. `grep -rn "narratives" lib etl tests` prints nothing.
- [ ] **Step 5:** Commit: "Drop the narratives table: stories are written offline, nothing caches them".

---

### Task 2: Story types, featured list, and the input builder

**Files:**
- Create: `lib/narrative/types.ts`, `lib/narrative/input.ts`, `etl/story-input.ts`, `stories/featured.json`
- Modify: `package.json` (script `"story:input": "node --env-file-if-exists=.env.local etl/story-input.ts"`)
- Test: `tests/narrative-input.test.ts`

**Interfaces:**
- Consumes: `queryArea`, `AreaResult`, `AreaItem` (`lib/db/area.ts`); `getSummary` (`lib/wiki/summary.ts`); `getCacheDb`, `sqliteSummaryCache` (`lib/db/cache.ts`); `formatRange` (`lib/time/index.ts`); `DB_PATH` (`lib/db/schema.ts`).
- Produces, in `lib/narrative/types.ts` (zod schemas with inferred types of the same name minus `Schema`):
  - `FeaturedEntrySchema`: `{ id: string (kebab-case), place: string, from: int, to: int, cell: string (isGridCell) }`; `FeaturedListSchema` = array of it.
  - `InputItemSchema`: `{ ref: string (/^[EP]\d+$/), qid, label, kind, description: string|null, years: string, start_year, end_year, loc_confidence: "exact"|"inherited", wikipedia_title: string|null, extract: string|null }`
  - `StoryInputSchema`: `{ entry: FeaturedEntry, generatedAt: string, dbRows: number, eventsTotal: number, othersTotal: number, context: { ref: "C", text: string }, items: InputItem[] }`
  - `SentenceSchema`: `{ text: string, cites: string[] }` (empty allowed here, so the checker can report it as `uncited`); `StorySchema`: `{ id, rulesVersion: int, writtenAt, writtenBy, paragraphs: Sentence[][] (min 1 each) }`
- Produces, in `lib/narrative/input.ts`:
  - `buildStoryInput(entry: FeaturedEntry, area: AreaResult, extracts: ReadonlyMap<string, string | null>, meta: { generatedAt: string; dbRows: number }): StoryInput`
  - `sourceText(input: StoryInput, ref: string): string` (throws on an unknown ref)

- [ ] **Step 1: Write the failing tests** in `tests/narrative-input.test.ts`, building `AreaResult` objects inline:
  - events get refs `E1..En` in the area's event order (by year), others get `P1..Pn` in the area's others order; at most 12 events and 5 others even if the area holds more.
  - `years` equals `formatRange(start_year, end_year)`, for example `"430 BCE to 426 BCE"` for -430..-426.
  - `context.text` for eventsTotal 3, othersTotal 1, with one inherited event among three equals exactly `"This area has 3 documented events and 1 documented people and places in this range. 1 of these 3 events have approximate locations."`
  - `sourceText(input, "E1")` contains the label, description, years, and extract on separate lines, and contains `"approximate location"` only when the item is inherited; `sourceText(input, "C")` equals `context.text`; `sourceText(input, "E99")` throws.
  - `StoryInputSchema.parse(buildStoryInput(...))` succeeds.
- [ ] **Step 2:** Run `npx vitest run tests/narrative-input.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the types and the two functions. `extracts` maps qid to extract text or null.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Create `stories/featured.json` with the twenty entries from spec section 5 (id, place, from, to, cell; values verbatim from the table), ordered by `from`. Add a test that `FeaturedListSchema.parse` accepts it, ids are unique, and it has 20 entries.
- [ ] **Step 6:** Implement `etl/story-input.ts <id> [--force]`: reads `stories/featured.json`, opens `DB_PATH` read-only, runs `queryArea(db, { cell, from, to, eventsLimit: 12, othersLimit: 5 })`, fetches every item with a `wikipedia_title` through `getSummary` (cache `sqliteSummaryCache(getCacheDb())`, `fetch`, `process.env.WIKIMEDIA_CONTACT`), maps `ok` to the extract and `missing` to null, and exits non-zero without writing on any `error` result. `dbRows` is `SELECT COUNT(*) FROM events`. Writes `stories/inputs/<id>.json` (2-space JSON, trailing newline). Refuses to run if `stories/<id>.json` exists unless `--force`. Exits non-zero for an unknown id.
- [ ] **Step 7:** Check `WIKIMEDIA_CONTACT` is set without printing it: `node --env-file-if-exists=.env.local -e "process.exit(process.env.WIKIMEDIA_CONTACT ? 0 : 1)"`. Expected: exit 0. If 1, stop and ask the owner. Then run `npm run story:input -- athens`. Expected: `stories/inputs/athens.json` with 8 E items, 5 P items, `eventsTotal` 8. Keep the file (Task 8 uses it).
- [ ] **Step 8:** Run tests, typecheck, lint. Commit: "Freeze story inputs from the area query and Wikipedia".

---

### Task 3: The checker

**Files:**
- Create: `lib/narrative/check.ts`, `lib/narrative/allowlist.ts`
- Test: `tests/narrative-check.test.ts`

**Interfaces:**
- Consumes: `StorySchema`, `StoryInput`, `sourceText` (Task 2).
- Produces:
  - `ALLOWLIST: ReadonlySet<string>`: lower-case words, exactly the list in spec 6.6 item 3 (era and source words, twelve month names, the generic sentence-opening words).
  - `type Failure = { code: "shape" | "unknown-ref" | "uncited" | "length" | "dash" | "number" | "name"; sentence?: number; detail: string }`
  - `checkStory(story: unknown, input: StoryInput): Failure[]` (empty means pass; `sentence` is the 0-based index across all paragraphs)

- [ ] **Step 1: Write the failing tests.** Build one valid input inline (two events with extracts, one inherited, one person, `C`) and one passing story of 60 to 250 words; assert `checkStory` returns `[]`. Then one test per failure, each asserting the returned codes exactly:
  - story missing `paragraphs` gives `["shape"]`; a sentence with `cites: []` gives `["uncited"]`; cite `"E9"` gives `["unknown-ref"]`.
  - 59 words and 251 words each give `["length"]`.
  - an em dash and an en dash in a sentence each give `["dash"]`.
  - a number absent from the cited items gives `["number"]`; `"430 CE"` against a source with only `"430 BC"` gives `["number"]`; `"430 BCE"` against `"430 BC"` passes; `"10,000"` against `"10000"` passes.
  - a number present only in E1's text, in a sentence citing only E2, gives `["number"]` (wrong item).
  - `"three"` with no 3 or "three" in the cited text gives `["number"]`; `"thousands"` absent from the cited text gives `["number"]`.
  - an invented name gives `["name"]`; a sentence starting with "Later" passes (allowlist); "Hernán", "Moctezuma's", and "Anglo-Zulu" pass when the cited text has "Hernán", "Moctezuma", and "Anglo-Zulu War" respectively, and "Anglo-Saxon" fails against the same text.
  - a sentence citing `C` passes when it states the counts from `context.text`.
- [ ] **Step 2:** Run `npx vitest run tests/narrative-check.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement per spec 6.6. Decisions the spec leaves to here:
  - Normalise both sides before number matching: remove thousands commas inside digit runs; `\bBC\b` to `BCE`; `\bAD (\d+)` and `(\d+) AD\b` to `$1 CE`.
  - A number token is a digit run (with an optional decimal part) plus an era if `BCE` or `CE` follows it. A story number with an era passes only if the cited text has the same digits with the same era; without an era, the digits anywhere in the cited text suffice.
  - Number words: `one` to `twenty` and `dozen` (12) pass if the cited text has the digits or the word; `hundred(s)`, `thousand(s)`, `million(s)` pass only if the word appears.
  - Name tokens: `/\p{Lu}[\p{L}\p{M}'’-]*/gu`. Strip a trailing `'s` or `’s`. Pass if the token is in `ALLOWLIST` (lower-cased), or occurs as a whole word ignoring case in the cited text, or (hyphenated) every hyphen part does.
  - Length counts whitespace-separated words across all sentences.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Run tests, typecheck, lint. Commit: "Check stories sentence by sentence against their cited items".

---

### Task 4: Publish and staleness

**Files:**
- Create: `lib/narrative/publish.ts`, `lib/narrative/stale.ts`, `etl/story-publish.ts`, `etl/story-check.ts`, `tests/stories.test.ts`
- Modify: `package.json` (`"story:publish": "node etl/story-publish.ts"`, `"story:check": "node etl/story-check.ts"`), `README.md` (ETL section: run `npm run story:check` after `etl:load`)
- Test: `tests/narrative-publish.test.ts`, `tests/narrative-stale.test.ts`

**Interfaces:**
- Consumes: Task 2 types, `checkStory` (Task 3), `queryArea`.
- Produces:
  - `type PublishedCite = { ref: string; qid: string | null; label: string }` (`C` maps to `qid: null`, `label: "this area's lists"`)
  - `type PublishedStory = { entry: FeaturedEntry; writtenAt: string; writtenBy: string; paragraphs: { text: string; cites: PublishedCite[] }[][] }`
  - `publishStories(featured: FeaturedEntry[], stories: Story[], inputs: ReadonlyMap<string, StoryInput>): PublishedStory[]` (only entries that have a story, in `featured` order; throws if a story has no input or fails `checkStory`)
  - `staleness(published: PublishedStory, box: AreaResult, top: AreaResult, input: StoryInput): { stale: string[]; drift: boolean }` where `box` is the area at limits 25/30 and `top` at 12/5.

- [ ] **Step 1: Write the failing tests:** `publishStories` maps refs to qid and label and `C` to null; skips featured entries without a story; throws on a failing story. `staleness`: a cited qid absent from `box` gives a `stale` entry naming it; a cited item whose label or years text changed gives a `stale` entry; a different top-17 set with all cited items intact gives `stale: []`, `drift: true`.
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Implement `etl/story-publish.ts` (read featured, every `stories/<id>.json` except `featured.json` and `published.json`, matching inputs; write `stories/published.json`) and `etl/story-check.ts` (open the database read-only, run `queryArea` twice per published story, print stale ids with reasons and drift warnings, exit 1 if anything is stale). Run `npm run story:publish`. Expected: `stories/published.json` is `[]`.
- [ ] **Step 6:** In `tests/stories.test.ts`: for every story file, `checkStory` against its input returns `[]`; every story id is in `featured.json`; `publishStories(...)` deep-equals the committed `stories/published.json` (so a forgotten publish fails the tests). Read files with `node:fs`.
- [ ] **Step 7:** Run tests, typecheck, lint. Commit: "Publish checked stories and detect stale ones after a rebuild".

---

### Task 5: Client catalog, exact matching, and the guard

**Files:**
- Create: `lib/stories/catalog.ts`
- Modify: `lib/cells.ts`
- Test: `tests/catalog.test.ts`, `tests/cells.test.ts`

**Interfaces:**
- Consumes: `PublishedStory` (Task 4), `RES_BANDS`, `resolutionForZoom`.
- Produces:
  - `FEATURED: readonly FeaturedEntry[]` (entries of the published stories, ordered by `from`)
  - `storyFor(cell: string, from: number, to: number, stories?: readonly PublishedStory[]): PublishedStory | null` (exact match on all three; `stories` defaults to the imported `published.json`)
  - `missingCites(story: PublishedStory, area: AreaResult): string[]` (cited qids, ignoring null, absent from `area.events` and `area.others`)
  - `zoomForRes(res: Res): number` in `lib/cells.ts`: the band's `minZoom + 0.6`.

- [ ] **Step 1: Write the failing tests** with an inline `PublishedStory` list: exact match returns the story; `from + 1`, `to - 1`, or another cell returns null. `missingCites` returns `[]` when all are present, the missing qid when one is absent, and ignores `C`. For each res 2 to 5, `resolutionForZoom(zoomForRes(res)) === res`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `catalog.ts` imports only `stories/published.json`.
- [ ] **Step 4:** Run. Expected: PASS. Add a test asserting no file under `app/` or `lib/` contains the string `stories/inputs`.
- [ ] **Step 5:** Run tests, typecheck, lint. Commit: "Match stories to the box by exact cell and range".

---

### Task 6: The story in the box

**Files:**
- Create: `app/ui/Story.tsx`
- Modify: `app/ui/AreaBox.tsx`, `app/ui/globe.module.css`

**Interfaces:**
- Consumes: `storyFor`, `missingCites`, `PublishedStory`, `PublishedCite`.
- Produces: `Story({ story, onCite }: { story: PublishedStory; onCite: (qid: string | null) => void })`.

- [ ] **Step 1:** Implement `Story`: paragraphs of sentences; after each sentence, one `<button>` per cite with `aria-label` and `title` set to the cite's label, showing its 1-based position among the story's distinct cites. Under it the credit line, verbatim: "Written by Claude from the Wikipedia (CC BY-SA) and Wikidata text of the items cited. Featured story, " + the date part of `writtenAt` + ".", with "Wikipedia" and "Wikidata" linking to https://en.wikipedia.org and https://www.wikidata.org.
- [ ] **Step 2:** In `AreaBox`: compute `const story = result ? storyFor(cell, range.from, range.to) : null`; if `story` and `missingCites(story, result)` is non-empty, `console.warn` once per story id and missing list, and render nothing. Otherwise render `Story` between the header and the Events heading. Add `citedQid` state; an item is highlighted when `item.qid === focus || item.qid === citedQid`. `onCite(qid)` sets `citedQid` and scrolls `[data-qid="<qid>"]` into view (`block: "center"`); `onCite(null)` scrolls the Events heading into view. Reset `citedQid` when `base` changes.
- [ ] **Step 3:** Run tests, typecheck, lint. Expected: pass. (Behaviour is checked in the browser in Task 9, once real stories exist.)
- [ ] **Step 4:** Commit: "Show a featured story at the top of the box with clickable citations".

---

### Task 7: The Featured list and the camera move

**Files:**
- Create: `app/ui/FeaturedList.tsx`
- Modify: `app/ui/GlobeApp.tsx`, `app/ui/GlobeMap.tsx`, `app/ui/globe.module.css`

**Interfaces:**
- Consumes: `FEATURED`, `zoomForRes`, `formatRange`.
- Produces: `FeaturedList({ onChoose }: { onChoose: (e: FeaturedEntry) => void })`; new `GlobeMap` prop `flyTo?: { cell: string; nonce: number } | null`.

- [ ] **Step 1:** `FeaturedList`: a `<details>` section titled "Featured stories" in the left panel, between the title and the dot toggle, with the note "Written by Claude from the Wikipedia and Wikidata text of each area. Other areas show their lists only." and one `<button>` per `FEATURED` entry reading `${place}, ${formatRange(from, to)}`. Renders nothing when `FEATURED` is empty.
- [ ] **Step 2:** `GlobeApp.chooseFeatured(e)`: `setRange({ from: e.from, to: e.to })`, `setSelection({ kind: "cell", cell: e.cell })`, and set `flyTo` to `{ cell: e.cell, nonce: Date.now() }`.
- [ ] **Step 3:** `GlobeMap`: when `flyTo` changes, `map.flyTo({ center: [lng, lat] of cellToLatLng(cell), zoom: zoomForRes(getResolution(cell)) })`; after the move ends, run the existing occluder pan for the selected cell. If the existing selected-cell effect already pans, make sure the two do not fight (the pan must run after the fly ends).
- [ ] **Step 4:** Run tests, typecheck, lint. Commit: "Add the Featured stories list and fly to its cell".

---

### Task 8: Writing rules and the three pilot stories (main session only)

Story writing dispatches subagents, so the main session runs Tasks 8 and 9 itself, not an implementer subagent.

**Files:**
- Create: `stories/RULES.md` (`rulesVersion: 1`; the rules of spec 6.4 verbatim, plus the story file format of 6.3 and an example of a sentence citing `C`)
- Create: `stories/inputs/{athens,panipat,kyoto}.json`, `stories/{athens,panipat,kyoto}.json`
- Modify: `stories/published.json`

- [ ] **Step 1:** Write `stories/RULES.md`. Commit it alone.
- [ ] **Step 2:** For each of athens, panipat, kyoto: run `npm run story:input -- <id>` (athens exists from Task 2).
- [ ] **Step 3: Writer.** Dispatch a fresh general-purpose subagent per story with only: the paths of `stories/RULES.md` and the input file, the output path, the `writtenBy` value "Claude Opus 5.5 in Claude Code", and the instruction to read nothing else in the repo.
- [ ] **Step 4: Checker.** Run `npx vitest run tests/stories.test.ts` (after `npm run story:publish`). On failure, send the failures back to the same writer to revise the text. Repeat until it passes.
- [ ] **Step 5: Reviewer.** Dispatch a second fresh subagent with only the rules, the input, and the story, asking for each sentence: is every statement supported by the text of its cited items; are people's deeds placed correctly; is anything implied that the input does not say. Fix the findings through the writer, re-run Step 4. Keep the reviewer's findings for the gate report.
- [ ] **Step 6:** Read all three yourself. If the checker blocks correct, well-cited prose in a way the rules cannot fix (for example a common sentence opener missing from the allowlist), stop and report to the owner with the exact case: allowlist changes need the owner's sign-off.
- [ ] **Step 7:** Run tests, typecheck, lint. Commit inputs, stories, and `published.json` per story: "Add the <place> featured story".

---

### Task 9: The other seventeen stories and the browser acceptance (main session only)

- [ ] **Step 1:** Repeat Task 8 Steps 2 to 7 for the remaining seventeen ids in `stories/featured.json`. If an input proves unusable (spec section 5, last paragraph), replace the pick with another place in the same region and era, update `featured.json`, and note it for the gate report.
- [ ] **Step 2:** Add to `tests/stories.test.ts`: every `featured.json` entry has a story (20 stories).
- [ ] **Step 3:** Run `npm run story:check`. Expected: exit 0, no stale stories.
- [ ] **Step 4:** Start `npm run dev -- -p 3123`. In the browser check spec section 8 items 4 to 6 and 8: each Featured entry sets the range (readout shows the exact years), flies to the cell outside the box, and shows the story; citations scroll to and highlight their items by mouse and by keyboard (Tab then Enter); a `C` marker scrolls to the Events heading; one slider step hides the story and choosing the entry again restores it; choosing an entry while another box is open shows the new cell and range only; no console errors. Stop the dev server.
- [ ] **Step 5:** Commit.

---

### Task 10: Docs and the gate

**Files:**
- Modify: `CLAUDE.md`, `docs/PLAN.md`, `docs/superpowers/specs/2026-10-29-area-panel-design.md`, `docs/decisions.md`

- [ ] **Step 1:** Make the doc changes listed in spec section 7, and add decisions.md entry 30 with the content listed there, plus: the checker's measured outcome (how many writer revisions and reviewer findings across the twenty), the publish step (why `published.json` exists), and any replaced picks.
- [ ] **Step 2:** Update the CLAUDE.md status line: Phase 5 complete, at the gate, with the date and entry number.
- [ ] **Step 3:** Run tests, typecheck, lint, `npm run build`. Expected: all pass. A search for U+2014 and U+2013 across docs, stories, app, lib, etl, CLAUDE.md, and README.md finds nothing (for example `grep -rnP "\x{2014}|\x{2013}" ...`).\|–" docs stories app lib etl CLAUDE.md README.md` prints nothing.
- [ ] **Step 4:** Commit: "Record Phase 5 as built".
- [ ] **Step 5:** Gate report to the owner: acceptance items 1 to 9 with results, the reviewer findings per story, the coverage gaps, anything that failed. Stop for the go-ahead.
