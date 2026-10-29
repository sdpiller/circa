/**
 * After a database rebuild: re-queries each published story's area and reports stories whose cited
 * items changed (stale, exit 1) and areas whose top items moved (drift, a warning).
 * Usage: npm run story:check
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { queryArea } from "../lib/db/area.ts";
import { DB_PATH } from "../lib/db/schema.ts";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { staleness } from "../lib/narrative/stale.ts";
import { StoryInputSchema } from "../lib/narrative/types.ts";

const dir = fileURLToPath(new URL("../stories/", import.meta.url));
const published = JSON.parse(readFileSync(`${dir}published.json`, "utf8")) as PublishedStory[];

if (published.length === 0) {
  console.log("No published stories, nothing to check.");
  process.exit(0);
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
let anyStale = false;
for (const p of published) {
  const { id, cell, from, to } = p.entry;
  const input = StoryInputSchema.parse(JSON.parse(readFileSync(`${dir}inputs/${id}.json`, "utf8")));
  const box = queryArea(db, { cell, from, to, eventsLimit: 25, othersLimit: 30 });
  const top = queryArea(db, { cell, from, to, eventsLimit: 12, othersLimit: 5 });
  const r = staleness(p, box, top, input);
  if (r.stale.length > 0) {
    anyStale = true;
    console.log(`STALE ${id}:`);
    for (const reason of r.stale) console.log(`  ${reason}`);
  }
  if (r.drift) console.log(`drift ${id}: the area's top items differ from the frozen input (cited items intact: ${r.stale.length === 0})`);
}
db.close();
if (!anyStale) console.log("No stale stories.");
process.exit(anyStale ? 1 : 0);
