/**
 * Staleness after a database rebuild (spec 5.5), judged on the cited items only.
 * Stale: a cited item is gone, its label or years text changed, or it has no province.
 * Out of date: the point or provinces recomputed from the database differ from the published ones
 * (fixed by npm run story:publish). Warning only: a cited item's location confidence changed.
 */
import type { AreaItem } from "../db/area.ts";
import { formatRange } from "../time/index.ts";
import { citedQids, placeStory, type CitedRow, type PublishedStory } from "./publish.ts";
import type { StoryInput } from "./types.ts";

export type CitedNow = CitedRow & Pick<AreaItem, "label" | "start_year" | "end_year" | "loc_confidence">;

export function staleness(
  published: PublishedStory,
  input: StoryInput,
  rows: ReadonlyMap<string, CitedNow>,
): { stale: string[]; outOfDate: string[]; warnings: string[] } {
  const frozen = new Map(input.items.map((i) => [i.qid, i]));
  const labels = new Map(published.paragraphs.flat().flatMap((s) => s.cites).map((c) => [c.qid, c.label]));
  const stale: string[] = [];
  const outOfDate: string[] = [];
  const warnings: string[] = [];
  const found: CitedNow[] = [];
  for (const qid of citedQids(published)) {
    const label = labels.get(qid) ?? qid;
    const now = rows.get(qid);
    if (!now) {
      stale.push(`${qid} (${label}) no longer exists`);
      continue;
    }
    found.push(now);
    const was = frozen.get(qid);
    const years = formatRange(now.start_year, now.end_year);
    if (now.label !== (was?.label ?? label)) {
      stale.push(`${qid} label changed from "${was?.label ?? label}" to "${now.label}"`);
    } else if (was && years !== was.years) {
      stale.push(`${qid} (${label}) years changed from "${was.years}" to "${years}"`);
    } else if (was && now.loc_confidence !== was.loc_confidence) {
      warnings.push(`${published.entry.id}: ${qid} (${label}) location confidence changed from ${was.loc_confidence} to ${now.loc_confidence}`);
    }
    if (now.province_id === null) stale.push(`${qid} (${label}) no longer has a province`);
  }
  if (stale.length === 0 && found.length > 0) {
    const placement = placeStory(found);
    if (placement.provinces.join() !== published.provinces.join()) {
      outOfDate.push(`${published.entry.id}: provinces are now ${placement.provinces.join(", ")}, published ${published.provinces.join(", ")}`);
    }
    if (placement.point.join() !== published.point.join()) {
      outOfDate.push(`${published.entry.id}: point is now ${placement.point.join(", ")}, published ${published.point.join(", ")}`);
    }
  }
  return { stale, outOfDate, warnings };
}
