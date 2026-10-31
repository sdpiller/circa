/**
 * After a database rebuild: re-reads the items each published story cites. Reports stories whose
 * cited items are gone, renamed, redated or without a province (stale, exit 1), and stories whose
 * point or provinces no longer match the database (out of date, exit 1; run npm run story:publish).
 * A changed location confidence is a warning only.
 * Usage: npm run story:check
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { DB_PATH } from "../lib/db/schema.ts";
import { readCited } from "../lib/narrative/cited.ts";
import { citedQids, type PublishedStory } from "../lib/narrative/publish.ts";
import { staleness } from "../lib/narrative/stale.ts";
import { StoryInputSchema } from "../lib/narrative/types.ts";

const dir = fileURLToPath(new URL("../stories/", import.meta.url));
const published = JSON.parse(readFileSync(`${dir}published.json`, "utf8")) as PublishedStory[];

if (published.length === 0) {
  console.log("No published stories, nothing to check.");
  process.exit(0);
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
let failed = false;
for (const p of published) {
  const { id } = p.entry;
  const input = StoryInputSchema.parse(JSON.parse(readFileSync(`${dir}inputs/${id}.json`, "utf8")));
  const r = staleness(p, input, readCited(db, citedQids(p)));
  if (r.stale.length > 0) {
    failed = true;
    console.log(`STALE ${id}:`);
    for (const reason of r.stale) console.log(`  ${reason}`);
  }
  if (r.outOfDate.length > 0) {
    failed = true;
    console.log(`OUT OF DATE ${id} (run npm run story:publish):`);
    for (const reason of r.outOfDate) console.log(`  ${reason}`);
  }
  for (const w of r.warnings) console.log(`warning ${w}`);
}
db.close();
if (!failed) console.log("No stale stories.");
process.exit(failed ? 1 : 0);
