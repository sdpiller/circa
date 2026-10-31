/** Reads the database rows for the items a story cites. Shared by story:publish and story:check. */
import type Database from "better-sqlite3";
import type { CitedNow } from "./stale.ts";

export function readCited(db: Database.Database, qids: readonly string[]): Map<string, CitedNow> {
  const stmt = db.prepare(
    "SELECT qid, label, start_year, end_year, loc_confidence, lat, lon, sitelinks, province_id FROM events WHERE qid = ?",
  );
  const out = new Map<string, CitedNow>();
  for (const qid of qids) {
    const row = stmt.get(qid) as CitedNow | undefined;
    if (row) out.set(qid, row);
  }
  return out;
}
