/**
 * Load stage: data/raw/ -> data/chronoglobe.db.
 *
 * Builds a fresh database in a temp file, validates every row with zod, runs spot checks, and only
 * then renames it over the old one, so a failed or interrupted load never leaves a broken database.
 * Cached narratives from the previous database are carried over. Rebuilding is idempotent.
 *
 * Usage: npm run etl:load          (load from existing raw files)
 *        npm run etl               (fetch whatever is missing, then load)
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { formatYear } from "../lib/time/index.ts";
import { cellsForPoint } from "../lib/cells.ts";
import { DB_PATH, EventRow, SCHEMA_SQL } from "../lib/db/schema.ts";
import { buildDataset } from "./build.ts";
import { loadConfig } from "./fetch.ts";
import type { EventRecord } from "./normalize.ts";

export function toRow(r: EventRecord): EventRow {
  return EventRow.parse({
    qid: r.qid,
    label: r.label,
    label_lang: r.labelLang,
    description: r.description ?? null,
    kind: r.kind,
    category: r.category,
    class_key: r.classKey,
    start_year: r.startYear,
    end_year: r.endYear,
    orig_year: r.origYear,
    year_precision: r.yearPrecision,
    lat: r.lat,
    lon: r.lon,
    loc_confidence: r.locConfidence,
    loc_source: r.locSource,
    sitelinks: r.sitelinks,
    wikipedia_title: r.wikipediaTitle ?? null,
  });
}

/** Write a complete database to `path`, which must not exist yet. Copies narratives from `previous` if given. */
export function writeDatabase(path: string, rows: EventRow[], info: Record<string, string>, previous?: string): void {
  const db = new Database(path);
  try {
    db.pragma("journal_mode = DELETE"); // single file, nothing left beside it after close
    db.exec(SCHEMA_SQL);
    const insert = db.prepare(`INSERT INTO events (qid, label, label_lang, description, kind, category, class_key,
      start_year, end_year, orig_year, year_precision, lat, lon, loc_confidence, loc_source, sitelinks, wikipedia_title,
      h3_r2, h3_r3, h3_r4, h3_r5)
      VALUES (@qid, @label, @label_lang, @description, @kind, @category, @class_key,
      @start_year, @end_year, @orig_year, @year_precision, @lat, @lon, @loc_confidence, @loc_source, @sitelinks, @wikipedia_title,
      @h3_r2, @h3_r3, @h3_r4, @h3_r5)`);
    const setInfo = db.prepare("INSERT INTO build_info (key, value) VALUES (?, ?)");
    db.transaction(() => {
      for (const row of rows) insert.run({ ...row, ...cellsForPoint(row.lat, row.lon) });
      for (const [k, v] of Object.entries(info)) setInfo.run(k, v);
    })();
    if (previous && existsSync(previous)) {
      db.prepare("ATTACH DATABASE ? AS old").run(previous);
      const hasTable = db.prepare("SELECT 1 FROM old.sqlite_master WHERE type = 'table' AND name = 'narratives'").get();
      if (hasTable) db.exec("INSERT INTO narratives SELECT * FROM old.narratives");
      db.exec("DETACH DATABASE old");
    }
    db.exec("ANALYZE");
  } finally {
    db.close();
  }
}

/**
 * Famous items that must come out right (PLAN.md Phase 1 acceptance). Expected years are the
 * historical record; locations are checked against coarse boxes, not exact coordinates.
 */
export const SPOT_CHECKS = [
  { name: "Battle of Marathon", qid: "Q31900", year: -490, box: { south: 37.5, north: 38.5, west: 23.5, east: 24.5 } },
  { name: "Battle of Thermopylae", qid: "Q131969", year: -480, box: { south: 38.5, north: 39.2, west: 22.0, east: 23.0 } },
  { name: "eruption of Mount Vesuvius in 79", qid: "Q2411998", year: 79, box: { south: 40.5, north: 41.1, west: 14.0, east: 14.8 } },
  { name: "Fall of Constantinople", qid: "Q160077", year: 1453, box: { south: 40.8, north: 41.3, west: 28.6, east: 29.3 } },
];

export type SpotResult = { name: string; ok: boolean; detail: string };

export function runSpotChecks(db: Database.Database): SpotResult[] {
  const get = db.prepare("SELECT start_year, end_year, lat, lon, loc_confidence FROM events WHERE qid = ?");
  return SPOT_CHECKS.map(({ name, qid, year, box }) => {
    const r = get.get(qid) as { start_year: number; end_year: number; lat: number; lon: number; loc_confidence: string } | undefined;
    if (!r) return { name, ok: false, detail: `${qid} missing` };
    const yearOk = r.start_year <= year && r.end_year >= year;
    const placeOk = r.lat >= box.south && r.lat <= box.north && r.lon >= box.west && r.lon <= box.east;
    const years = r.start_year === r.end_year ? formatYear(r.start_year) : `${formatYear(r.start_year)} to ${formatYear(r.end_year)}`;
    return { name, ok: yearOk && placeOk, detail: `${years} at ${r.lat.toFixed(3)}, ${r.lon.toFixed(3)} (${r.loc_confidence})${yearOk ? "" : " WRONG YEAR"}${placeOk ? "" : " WRONG PLACE"}` };
  });
}

function main() {
  const allowMissing = process.argv.includes("--allow-missing");
  const started = Date.now();
  const config = loadConfig();
  const ds = buildDataset(config);
  if (ds.missing.length && !allowMissing) {
    throw new Error(`No raw data for: ${ds.missing.join(", ")}. Run npm run etl:fetch first, or pass --allow-missing.`);
  }

  const rows: EventRow[] = [];
  const invalid: string[] = [];
  for (const r of ds.kept) {
    try {
      rows.push(toRow(r));
    } catch (err) {
      invalid.push(`${r.qid}: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  if (invalid.length) throw new Error(`${invalid.length} rows failed validation, first ones:\n${invalid.slice(0, 5).join("\n")}`);

  mkdirSync(dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  rmSync(tmp, { force: true });
  writeDatabase(tmp, rows, {
    built_at: new Date().toISOString(),
    events: String(rows.length),
    classes: String(ds.stats.length),
    dropped_out_of_window: String(ds.dropped.outOfWindow),
    dropped_too_wide: String(ds.dropped.tooWide),
    missing_classes: ds.missing.join(",") || "none",
  }, DB_PATH);

  const check = new Database(tmp, { readonly: true });
  const results = runSpotChecks(check);
  const byKind = check.prepare("SELECT kind, COUNT(*) AS n FROM events GROUP BY kind ORDER BY n DESC").all() as { kind: string; n: number }[];
  check.close();
  for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}: ${r.detail}`);
  if (results.some((r) => !r.ok)) {
    throw new Error(`Spot checks failed; the new database was left at ${tmp} and the old one is untouched.`);
  }

  try {
    renameSync(tmp, DB_PATH);
  } catch (err) {
    // Verified on Windows: renaming over a database another process has open fails with EPERM.
    if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EBUSY") {
      throw new Error(`Could not replace ${DB_PATH}: another process has it open (the dev server?). Stop it and run npm run etl:load again. The new build is at ${tmp}.`);
    }
    throw err;
  }
  console.log(`\nWrote ${DB_PATH}: ${rows.length.toLocaleString("en-US")} rows in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  for (const { kind, n } of byKind) console.log(`  ${kind.padEnd(10)} ${n.toLocaleString("en-US")}`);
  console.log(`  dropped: ${ds.dropped.outOfWindow} outside the year window, ${ds.dropped.tooWide} with intervals over 1,000 years`);
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
