/** Turns checked stories into the published shape the client reads (spec 6.7). */
import type { Position } from "../geo/geometry.ts";
import { checkStory } from "./check.ts";
import { StorySchema, type FeaturedEntry, type Story, type StoryInput } from "./types.ts";

export type PublishedCite = { ref: string; qid: string | null; label: string };
export type PublishedStory = {
  entry: FeaturedEntry;
  /** [lon, lat] of the most notable cited item in the province holding the most cited items. */
  point: Position;
  /** adm1_code of each province holding a cited item, sorted. */
  provinces: string[];
  writtenAt: string;
  writtenBy: string;
  paragraphs: { text: string; cites: PublishedCite[] }[][];
};

export type Placement = { point: Position; provinces: string[] };
export type CitedRow = { qid: string; lat: number; lon: number; sitelinks: number; province_id: string | null };

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Where a story is: the province holding most cited items, and the most notable cited item in it. Ties go to the lower code, then the lower qid. */
export function placeStory(cited: CitedRow[]): Placement {
  const counts = new Map<string, CitedRow[]>();
  for (const row of cited) {
    if (row.province_id === null) throw new Error(`Cited item ${row.qid} has no province`);
    const list = counts.get(row.province_id) ?? [];
    list.push(row);
    counts.set(row.province_id, list);
  }
  if (counts.size === 0) throw new Error("A story must cite at least one item");
  const [main] = [...counts.entries()].sort(([ca, a], [cb, b]) => b.length - a.length || byCode(ca, cb));
  const [top] = [...main![1]].sort((a, b) => b.sitelinks - a.sitelinks || byCode(a.qid, b.qid));
  return { point: [top!.lon, top!.lat], provinces: [...counts.keys()].sort(byCode) };
}

/** Every distinct qid the story cites. The context ref has none. */
export function citedQids(story: PublishedStory): string[] {
  const qids = new Set<string>();
  for (const para of story.paragraphs)
    for (const sentence of para) for (const c of sentence.cites) if (c.qid !== null) qids.add(c.qid);
  return [...qids];
}

const CONTEXT_LABEL = "this area's lists";

export function publishStories(
  featured: FeaturedEntry[],
  stories: Story[],
  inputs: ReadonlyMap<string, StoryInput>,
  placements: ReadonlyMap<string, Placement>,
): PublishedStory[] {
  const byId = new Map(stories.map((s) => [s.id, s]));
  for (const id of byId.keys()) {
    if (!featured.some((e) => e.id === id)) throw new Error(`Story ${id} is not in the featured list`);
  }
  const out: PublishedStory[] = [];
  for (const entry of featured) {
    const story = byId.get(entry.id);
    if (!story) continue;
    const input = inputs.get(entry.id);
    if (!input) throw new Error(`Story ${entry.id} has no input`);
    if (input.entry.id !== entry.id) throw new Error(`Story ${entry.id} has an input for ${input.entry.id}`);
    for (const field of ["from", "to"] as const) {
      if (input.entry[field] !== entry[field]) throw new Error(`Story ${entry.id} has an input for a different ${field}`);
    }
    const placement = placements.get(entry.id);
    if (!placement) throw new Error(`Story ${entry.id} has no placement`);
    const failures = checkStory(story, input);
    if (failures.length > 0) {
      throw new Error(`Story ${entry.id} fails its checks: ${failures.map((f) => `${f.code}: ${f.detail}`).join("; ")}`);
    }
    const parsed = StorySchema.parse(story);
    const cite = (ref: string): PublishedCite => {
      if (ref === "C") return { ref, qid: null, label: CONTEXT_LABEL };
      const item = input.items.find((i) => i.ref === ref);
      if (!item) throw new Error(`Story ${entry.id} cites unknown ref ${ref}`);
      return { ref, qid: item.qid, label: item.label };
    };
    out.push({
      entry,
      point: placement.point,
      provinces: placement.provinces,
      writtenAt: parsed.writtenAt,
      writtenBy: parsed.writtenBy,
      paragraphs: parsed.paragraphs.map((p) => p.map((s) => ({ text: s.text, cites: s.cites.map(cite) }))),
    });
  }
  return out;
}
