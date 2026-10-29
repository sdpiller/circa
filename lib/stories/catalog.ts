import type { AreaResult } from "../db/area.ts";
import type { FeaturedEntry } from "../narrative/types.ts";
import type { PublishedStory } from "../narrative/publish.ts";
import published from "../../stories/published.json";

// The published file is already validated by tests/stories.test.ts, so it is cast, not re-parsed.
const PUBLISHED = published as readonly PublishedStory[];

export const FEATURED: readonly FeaturedEntry[] = PUBLISHED.map((s) => s.entry).sort(
  (a, b) => a.from - b.from || a.id.localeCompare(b.id),
);

/** The story for exactly this cell and range, or null. No near matches: a story describes one box. */
export function storyFor(
  cell: string,
  from: number,
  to: number,
  stories: readonly PublishedStory[] = PUBLISHED,
): PublishedStory | null {
  return stories.find((s) => s.entry.cell === cell && s.entry.from === from && s.entry.to === to) ?? null;
}

/** Cited qids (the null one is skipped) that the area no longer returns. */
export function missingCites(story: PublishedStory, area: AreaResult): string[] {
  const present = new Set([...area.events, ...area.others].map((i) => i.qid));
  const missing = new Set<string>();
  for (const para of story.paragraphs)
    for (const sentence of para)
      for (const c of sentence.cites) if (c.qid !== null && !present.has(c.qid)) missing.add(c.qid);
  return [...missing];
}
