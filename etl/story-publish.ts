/**
 * Checks every story against its frozen input, places it by the provinces of the items it cites,
 * and writes stories/published.json. Needs the database (npm run etl:load).
 * Usage: npm run story:publish
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { DB_PATH } from "../lib/db/schema.ts";
import { readCited } from "../lib/narrative/cited.ts";
import { placeStory, publishStories, type Placement } from "../lib/narrative/publish.ts";
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
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const placements = new Map<string, Placement>();
  try {
    for (const s of stories) {
      const refs = new Set(s.paragraphs.flat().flatMap((x) => x.cites));
      const input = inputs.get(s.id);
      const cited = [...(input?.items ?? [])].filter((i) => refs.has(i.ref)).map((i) => i.qid);
      const rows = readCited(db, cited);
      const missing = cited.filter((q) => !rows.has(q));
      if (missing.length > 0) throw new Error(`Story ${s.id} cites ${missing.join(", ")}, which is not in the database`);
      placements.set(s.id, placeStory([...rows.values()]));
    }
  } finally {
    db.close();
  }
  const published = publishStories(featured, stories, inputs, placements);
  writeFileSync(`${dir}published.json`, JSON.stringify(published, null, 2) + "\n");
  console.log(`Published ${published.length} of ${featured.length} stories.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
