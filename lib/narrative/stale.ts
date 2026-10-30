/**
 * Staleness after a database rebuild (spec 6.7). Stale: a cited item is gone from the area, or its
 * label or years text changed. Drift: the area's top items differ from the frozen input, with every
 * cited item intact; a warning only. Warnings (never stale): the C sentence would now read differently,
 * or a cited item's location confidence changed.
 */
import type { AreaResult } from "../db/area.ts";
import { contextText } from "./input.ts";
import { formatRange } from "../time/index.ts";
import type { PublishedStory } from "./publish.ts";
import type { StoryInput } from "./types.ts";

/** box is the area at limits 25/30, top at 12/5 (the limits the input was frozen with). */
export function staleness(
  published: PublishedStory,
  box: AreaResult,
  top: AreaResult,
  input: StoryInput,
): { stale: string[]; drift: boolean; warnings: string[] } {
  const current = new Map([...box.events, ...box.others].map((i) => [i.qid, i]));
  const frozen = new Map(input.items.map((i) => [i.qid, i]));
  const stale: string[] = [];
  const warnings: string[] = [];
  let citesContext = false;
  const seen = new Set<string>();
  for (const para of published.paragraphs) {
    for (const sentence of para) {
      for (const c of sentence.cites) {
        if (c.qid === null) {
          if (c.ref === input.context.ref) citesContext = true;
          continue;
        }
        if (seen.has(c.qid)) continue;
        seen.add(c.qid);
        const now = current.get(c.qid);
        if (!now) {
          stale.push(`${c.qid} (${c.label}) is no longer in the area box`);
          continue;
        }
        const was = frozen.get(c.qid);
        const years = formatRange(now.start_year, now.end_year);
        if (now.label !== (was?.label ?? c.label)) {
          stale.push(`${c.qid} label changed from "${was?.label ?? c.label}" to "${now.label}"`);
        } else if (was && years !== was.years) {
          stale.push(`${c.qid} (${c.label}) years changed from "${was.years}" to "${years}"`);
        } else if (was && now.loc_confidence !== was.loc_confidence) {
          warnings.push(`${published.entry.id}: ${c.qid} (${c.label}) location confidence changed from ${was.loc_confidence} to ${now.loc_confidence}`);
        }
      }
    }
  }
  if (citesContext) {
    const text = contextText(top.eventsTotal, top.othersTotal, top.events.slice(0, 12));
    if (text !== input.context.text) {
      warnings.push(`${published.entry.id}: the C sentence source changed from "${input.context.text}" to "${text}"`);
    }
  }
  const nowTop = new Set([...top.events, ...top.others].map((i) => i.qid));
  const drift = nowTop.size !== frozen.size || [...frozen.keys()].some((q) => !nowTop.has(q));
  return { stale, drift, warnings };
}
