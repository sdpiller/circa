import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkStory } from "../lib/narrative/check.ts";
import { publishStories } from "../lib/narrative/publish.ts";
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

  it("every story passes the checker against its input", () => {
    for (const s of stories) {
      const input = inputs.get(s.id);
      expect(input, `input for ${s.id}`).toBeDefined();
      expect(checkStory(s, input!), s.id).toEqual([]);
    }
  });

  it("stories/published.json is what publishStories produces (run npm run story:publish)", () => {
    expect(readJson("published.json")).toEqual(JSON.parse(JSON.stringify(publishStories(featured, stories, inputs))));
  });
});
