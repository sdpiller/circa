/**
 * Freezes the input a featured story is written from: the area query plus Wikipedia extracts.
 * Usage: npm run story:input -- <id> [--force]
 * Writes stories/inputs/<id>.json. Refuses to run when stories/<id>.json exists, unless --force.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { queryArea } from "../lib/db/area.ts";
import { getCacheDb, sqliteSummaryCache } from "../lib/db/cache.ts";
import { DB_PATH } from "../lib/db/schema.ts";
import { buildStoryInput } from "../lib/narrative/input.ts";
import { FeaturedListSchema, StoryInputSchema } from "../lib/narrative/types.ts";
import { getSummary } from "../lib/wiki/summary.ts";

const args = process.argv.slice(2);
const force = args.includes("--force");
const id = args.find((a) => !a.startsWith("--"));
if (!id) {
  console.error("Usage: npm run story:input -- <id> [--force]");
  process.exit(1);
}

const featuredPath = join("stories", "featured.json");
const list = FeaturedListSchema.parse(JSON.parse(readFileSync(featuredPath, "utf8")));
const entry = list.find((e) => e.id === id);
if (!entry) {
  console.error(`Unknown story id: ${id}`);
  process.exit(1);
}

if (existsSync(join("stories", `${id}.json`)) && !force) {
  console.error(`stories/${id}.json exists. Re-freezing the input means rewriting and re-reviewing the story. Pass --force to continue.`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
const area = queryArea(db, { cell: entry.cell, from: entry.from, to: entry.to, eventsLimit: 12, othersLimit: 5 });
const dbRows = (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
db.close();

const cache = sqliteSummaryCache(getCacheDb());
const contact = process.env.WIKIMEDIA_CONTACT;
const extracts = new Map<string, string | null>();
let failed = false;
for (const item of [...area.events, ...area.others]) {
  if (!item.wikipedia_title) continue;
  const res = await getSummary(item.wikipedia_title, { cache, fetch, contact });
  if (res.status === "error") {
    console.error(`${item.qid} (${item.wikipedia_title}): ${res.reason}`);
    failed = true;
  } else {
    extracts.set(item.qid, res.status === "ok" ? res.summary.extract : null);
  }
}
if (failed) {
  console.error("Not written: at least one summary failed. Run again.");
  process.exit(1);
}

const input = StoryInputSchema.parse(buildStoryInput(entry, area, extracts, { generatedAt: new Date().toISOString(), dbRows }));
mkdirSync(join("stories", "inputs"), { recursive: true });
const out = join("stories", "inputs", `${id}.json`);
writeFileSync(out, JSON.stringify(input, null, 2) + "\n");
const e = input.items.filter((i) => i.ref.startsWith("E")).length;
console.log(`${out}: ${e} events, ${input.items.length - e} others, eventsTotal ${input.eventsTotal}`);
