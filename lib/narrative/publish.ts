/** Turns checked stories into the published shape the client reads (spec 6.7). */
import { checkStory } from "./check.ts";
import { StorySchema, type FeaturedEntry, type Story, type StoryInput } from "./types.ts";

export type PublishedCite = { ref: string; qid: string | null; label: string };
export type PublishedStory = {
  entry: FeaturedEntry;
  writtenAt: string;
  writtenBy: string;
  paragraphs: { text: string; cites: PublishedCite[] }[][];
};

const CONTEXT_LABEL = "this area's lists";

export function publishStories(
  featured: FeaturedEntry[],
  stories: Story[],
  inputs: ReadonlyMap<string, StoryInput>,
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
    for (const field of ["cell", "from", "to"] as const) {
      if (input.entry[field] !== entry[field]) throw new Error(`Story ${entry.id} has an input for a different ${field}`);
    }
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
      writtenAt: parsed.writtenAt,
      writtenBy: parsed.writtenBy,
      paragraphs: parsed.paragraphs.map((p) => p.map((s) => ({ text: s.text, cites: s.cites.map(cite) }))),
    });
  }
  return out;
}
