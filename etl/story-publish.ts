/**
 * Checks every story against its frozen input and writes stories/published.json.
 * Usage: npm run story:publish
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { publishStories } from "../lib/narrative/publish.ts";
import { FeaturedListSchema, StoryInputSchema, StorySchema, type StoryInput } from "../lib/narrative/types.ts";

const dir = fileURLToPath(new URL("../stories/", import.meta.url));
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const featured = FeaturedListSchema.parse(readJson(`${dir}featured.json`));
const storyFiles = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "featured.json" && f !== "published.json");
const stories = storyFiles.map((f) => StorySchema.parse(readJson(`${dir}${f}`)));
const inputs = new Map<string, StoryInput>();
for (const s of stories) {
  const path = `${dir}inputs/${s.id}.json`;
  if (existsSync(path)) inputs.set(s.id, StoryInputSchema.parse(readJson(path)));
}

try {
  const published = publishStories(featured, stories, inputs);
  writeFileSync(`${dir}published.json`, JSON.stringify(published, null, 2) + "\n");
  console.log(`Published ${published.length} of ${featured.length} stories.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
