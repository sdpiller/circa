import type { AreaItem } from "../db/area.ts";
import type { PublishedStory } from "../narrative/publish.ts";
import { yearCount } from "../time/index.ts";
import published from "../../stories/published.json" with { type: "json" };

// The published file is already validated by tests/stories.test.ts, so it is cast, not re-parsed.
export const PUBLISHED = published as unknown as readonly PublishedStory[];

export const STORIES: readonly PublishedStory[] = [...PUBLISHED].sort(
  (a, b) => a.entry.from - b.entry.from || a.entry.id.localeCompare(b.entry.id),
);

export type Intent = "click" | "range";

/** Years two inclusive ranges share, or 0. */
function overlapYears(aFrom: number, aTo: number, bFrom: number, bTo: number): number {
  const from = Math.max(aFrom, bFrom);
  const to = Math.min(aTo, bTo);
  return from <= to ? yearCount(from, to) : 0;
}

/**
 * The story for a province and range, or null (spec 4.2). A click opens a story in its province when the
 * shared years cover half the chosen range or half the story's years; of several, the smallest set of
 * provinces, then the lower id. A range matches only a story's exact years.
 */
export function storyFor(
  provinceId: string,
  from: number,
  to: number,
  intent: Intent,
  stories: readonly PublishedStory[] = PUBLISHED,
): PublishedStory | null {
  const matches = stories.filter((s) => {
    if (!s.provinces.includes(provinceId)) return false;
    if (intent === "range") return s.entry.from === from && s.entry.to === to;
    const shared = overlapYears(from, to, s.entry.from, s.entry.to);
    return shared > 0 && (shared * 2 >= yearCount(from, to) || shared * 2 >= yearCount(s.entry.from, s.entry.to));
  });
  matches.sort((a, b) => a.provinces.length - b.provinces.length || (a.entry.id < b.entry.id ? -1 : 1));
  return matches[0] ?? null;
}

/** Cited qids (the null one is skipped) that the area no longer returns. */
export function missingCites(story: PublishedStory, area: { events: AreaItem[]; others: AreaItem[] }): string[] {
  const present = new Set([...area.events, ...area.others].map((i) => i.qid));
  const missing = new Set<string>();
  for (const para of story.paragraphs)
    for (const sentence of para)
      for (const c of sentence.cites) if (c.qid !== null && !present.has(c.qid)) missing.add(c.qid);
  return [...missing];
}
