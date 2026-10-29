/**
 * Staleness after a database rebuild (spec 6.7). Stale: a cited item is gone from the area, or its
 * label or years text changed. Drift: the area's top items differ from the frozen input, with every
 * cited item intact; a warning only.
 */
import type { AreaResult } from "../db/area.ts";
import { formatRange } from "../time/index.ts";
import type { PublishedStory } from "./publish.ts";
import type { StoryInput } from "./types.ts";

/** box is the area at limits 25/30, top at 12/5 (the limits the input was frozen with). */
export function staleness(
  published: PublishedStory,
  box: AreaResult,
  top: AreaResult,
  input: StoryInput,
): { stale: string[]; drift: boolean } {
  const current = new Map([...box.events, ...box.others].map((i) => [i.qid, i]));
  const frozen = new Map(input.items.map((i) => [i.qid, i]));
  const stale: string[] = [];
  const seen = new Set<string>();
  for (const para of published.paragraphs) {
    for (const sentence of para) {
      for (const c of sentence.cites) {
        if (c.qid === null || seen.has(c.qid)) continue;
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
        }
      }
    }
  }
  const nowTop = new Set([...top.events, ...top.others].map((i) => i.qid));
  const drift = nowTop.size !== frozen.size || [...frozen.keys()].some((q) => !nowTop.has(q));
  return { stale, drift };
}
