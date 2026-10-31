import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkStory } from "../lib/narrative/check.ts";
import { publishStories, type Placement, type PublishedStory } from "../lib/narrative/publish.ts";
import { FeaturedListSchema, StoryInputSchema, StorySchema, type StoryInput } from "../lib/narrative/types.ts";

const dir = new URL("../stories/", import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, dir), "utf8"));

const featured = FeaturedListSchema.parse(readJson("featured.json"));
const storyFiles = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "featured.json" && f !== "published.json");
const stories = storyFiles.map((f) => StorySchema.parse(readJson(f)));
const inputs = new Map<string, StoryInput>();
for (const s of stories) {
  if (existsSync(new URL(`inputs/${s.id}.json`, dir))) inputs.set(s.id, StoryInputSchema.parse(readJson(`inputs/${s.id}.json`)));
}

describe("committed stories", () => {
  it("every story id is in featured.json", () => {
    for (const s of stories) expect(featured.map((e) => e.id)).toContain(s.id);
  });

  it("every featured.json entry has a story, twenty in all", () => {
    expect(featured).toHaveLength(20);
    expect(stories.map((s) => s.id).sort()).toEqual(featured.map((e) => e.id).sort());
  });

  it("every story passes the checker against its input", () => {
    for (const s of stories) {
      const input = inputs.get(s.id);
      expect(input, `input for ${s.id}`).toBeDefined();
      expect(checkStory(s, input!), s.id).toEqual([]);
    }
  });

  it("no sentence citing C contains a number", () => {
    const number = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|twenty|thirty|forty|fifty|hundreds?|thousands?)\b/i;
    const offending = stories.flatMap((s) =>
      s.paragraphs.flat().filter((sentence) => sentence.cites.includes("C") && number.test(sentence.text)).map((sentence) => `${s.id}: ${sentence.text}`),
    );
    expect(offending).toEqual([]);
  });

  it("stories/published.json is what publishStories produces (run npm run story:publish)", () => {
    const published = readJson("published.json") as PublishedStory[];
    const placements = new Map<string, Placement>(published.map((p) => [p.entry.id, { point: p.point, provinces: p.provinces }]));
    expect(published).toEqual(JSON.parse(JSON.stringify(publishStories(featured, stories, inputs, placements))));
  });

  it("every published story has provinces and a finite point", () => {
    const published = readJson("published.json") as PublishedStory[];
    expect(published).toHaveLength(20);
    for (const p of published) {
      expect(p.provinces.length, p.entry.id).toBeGreaterThan(0);
      expect(p.point, p.entry.id).toHaveLength(2);
      expect(p.point.every(Number.isFinite), p.entry.id).toBe(true);
    }
  });

  it("frozen inputs keep their cell, and featured.json has none", () => {
    for (const input of inputs.values()) expect(typeof input.entry.cell).toBe("string");
    for (const e of featured) expect(e).not.toHaveProperty("cell");
  });
});
