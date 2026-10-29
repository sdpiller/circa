# Writing rules for featured stories

rulesVersion: 1

You are writing one short history of one area of the globe for one span of years. Everything you may say is in one input file. Your general knowledge of history is not a source: if the input does not say it, the story does not say it, however sure you are that it is true.

## The input

The input file (`stories/inputs/<id>.json`) holds:

- `entry`: the place name, the cell, and the year range (`from`, `to`; negative years are BCE).
- `items`: up to 12 events (refs `E1`, `E2`, ...) in year order, then up to 5 people and places (refs `P1`, ...) by notability. Each item has a `label`, a `kind`, a Wikidata `description` (may be null), its `years` text, its `loc_confidence`, and its English Wikipedia `extract` (null when there is no article).
- `context`: one generated sentence with ref `C` that gives how many events and people and places are documented here, and how many of the listed events have approximate locations.
- `eventsTotal` and `othersTotal`: how many exist in total. If `eventsTotal` is more than the events listed, the story covers the most notable ones only.

The "source text" of an item is its label, description, years text, the words "approximate location" when `loc_confidence` is `inherited`, and its extract. For `C` it is the context sentence.

## The rules

- Use only the input. No names, numbers, dates, places, or causal links that the input does not state. Copy numbers and dates as the input gives them; do not compute new ones ("a decade later", "the 5th century").
- 60 to 250 words, chronological, plain prose, no headings or lists. Short is fine when the input is thin.
- Every sentence cites at least one ref, and every statement in a sentence is supported by the text of the items that sentence cites.
- Do not restate the area size or the year range.
- Where cited events have inherited locations, say their placement is approximate.
- People and places: state their tie to this area (born here, founded or built here, as the kind says: `birth` means born here, `founding` means founded here, `structure` means built or dated here). Their later deeds happened elsewhere unless their text says they happened here; do not tell them as if they happened here.
- Keep to what happened inside the range. Something an extract mentions outside it may be left out, or named as earlier or later.
- When the box has few events, say so plainly, citing `C`. Never pad.
- A year before the common era always carries BCE ("480 BCE"), never bare, so no reader takes it for CE. Write common-era years as the cited text writes them ("1453" or "1453 CE").
- No em dashes or en dashes. Use commas, colons, or full stops.

## How the checker reads your story

A program checks every sentence against the source text of the refs that sentence cites, and only those refs. A fact that is true but sits in another item's text fails: cite that item too, or move the fact.

- **Numbers.** Every number, whether in digits ("480", "10,000", "5th") or words ("three", "forty thousand", "fifth", "twenty-five"), must appear in the cited source text with the same value. A number with an era ("480 BCE") needs the same era there; "century" and "millennium" must match too. Wikipedia's "BC" and "AD" count as BCE and CE.
- **Names.** Every word that starts with a capital letter must appear in the cited source text (ignoring case), unless it is on the allowlist in `lib/narrative/allowlist.ts`: BCE, CE, BC, AD, Wikipedia, Wikidata, the month names, and generic sentence openers (A, An, The, In, On, At, By, For, From, To, Of, After, Before, During, Later, Earlier, Over, Under, Between, Among, Around, Within, With, While, When, Although, Here, There, This, That, These, Those, It, Its, They, Their, He, His, She, Her, Only, Most, Some, Several, Both, Few, Little, Much, Many, No, Nothing, None). Start sentences with one of those words or with a name from the source; "Then", "Eventually", or "Meanwhile" at the start of a sentence fail.
- **Shape.** 60 to 250 words in total, every sentence cites at least one ref, every ref exists in the input, no em or en dash.

When the checker fails a sentence, change the sentence. Never ask for the checker or the allowlist to change.

## The story file

Write `stories/<id>.json`:

```json
{
  "id": "<the entry id>",
  "rulesVersion": 1,
  "writtenAt": "<today, YYYY-MM-DD>",
  "writtenBy": "Claude Opus 5.5 in Claude Code",
  "paragraphs": [
    [
      { "text": "Only 3 events are documented here, so this account is short.", "cites": ["C"] },
      { "text": "<a sentence>", "cites": ["E1"] }
    ],
    [
      { "text": "<a sentence>", "cites": ["E2", "P1"] }
    ]
  ]
}
```

One or two paragraphs. Sentence text holds no citation markers; the app draws them from `cites`.
