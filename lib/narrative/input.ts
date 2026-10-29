/** Builds the frozen input a story is written from, and the source text each ref stands for. */
import type { AreaItem, AreaResult } from "../db/area.ts";
import { formatRange } from "../time/index.ts";
import type { FeaturedEntry, InputItem, StoryInput } from "./types.ts";

const MAX_EVENTS = 12;
const MAX_OTHERS = 5;

function toItem(ref: string, a: AreaItem, extracts: ReadonlyMap<string, string | null>): InputItem {
  return {
    ref,
    qid: a.qid,
    label: a.label,
    kind: a.kind,
    description: a.description,
    years: formatRange(a.start_year, a.end_year),
    start_year: a.start_year,
    end_year: a.end_year,
    loc_confidence: a.loc_confidence,
    wikipedia_title: a.wikipedia_title,
    extract: extracts.get(a.qid) ?? null,
  };
}

export function buildStoryInput(
  entry: FeaturedEntry,
  area: AreaResult,
  extracts: ReadonlyMap<string, string | null>,
  meta: { generatedAt: string; dbRows: number },
): StoryInput {
  const events = area.events.slice(0, MAX_EVENTS);
  const others = area.others.slice(0, MAX_OTHERS);
  const approx = events.filter((e) => e.loc_confidence === "inherited").length;
  return {
    entry,
    generatedAt: meta.generatedAt,
    dbRows: meta.dbRows,
    eventsTotal: area.eventsTotal,
    othersTotal: area.othersTotal,
    context: {
      ref: "C",
      text:
        `This area has ${area.eventsTotal} documented events and ${area.othersTotal} documented people and places in this range. ` +
        `${approx} of these ${events.length} events have approximate locations.`,
    },
    items: [
      ...events.map((e, i) => toItem(`E${i + 1}`, e, extracts)),
      ...others.map((o, i) => toItem(`P${i + 1}`, o, extracts)),
    ],
  };
}

/** The text a cited ref supports. Throws on an unknown ref. */
export function sourceText(input: StoryInput, ref: string): string {
  if (ref === input.context.ref) return input.context.text;
  const item = input.items.find((i) => i.ref === ref);
  if (!item) throw new Error(`Unknown ref ${ref}`);
  return [item.label, item.description, item.years, item.loc_confidence === "inherited" ? "approximate location" : null, item.extract]
    .filter((p): p is string => !!p && p.length > 0)
    .join("\n");
}
