import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dedupe, isTooWide } from "../etl/build.ts";
import { runSpotChecks, SPOT_CHECKS, toRow, writeDatabase } from "../etl/load.ts";
import type { EventRecord } from "../etl/normalize.ts";
import { effectiveInterval } from "../lib/time/index.ts";

const rec = (over: Partial<EventRecord>): EventRecord => ({
  qid: "Q1",
  classKey: "battle",
  kind: "event",
  category: "conflict",
  label: "Test",
  labelLang: "en",
  sitelinks: 3,
  startYear: -490,
  endYear: -490,
  origYear: -490,
  yearPrecision: 9,
  lat: 38,
  lon: 23,
  locConfidence: "exact",
  locSource: "P625",
  locChoices: 1,
  ...over,
});
const priorities = {
  kindPriority: ["event", "founding", "discovery", "structure", "birth"] as const,
  categoryPriority: ["disaster", "conflict", "politics", "founding", "science", "culture", "other"],
};

describe("dedupe", () => {
  it("keeps one record per QID, preferring the higher-priority kind", () => {
    const out = dedupe([rec({ kind: "structure", category: "culture", classKey: "structure" }), rec({ kind: "event" })], { ...priorities, kindPriority: [...priorities.kindPriority] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("event");
  });

  it("breaks ties within a kind by category priority", () => {
    const out = dedupe([rec({ category: "conflict" }), rec({ category: "disaster", classKey: "earthquake" })], { ...priorities, kindPriority: [...priorities.kindPriority] });
    expect(out[0].category).toBe("disaster");
  });

  it("fails loudly on a kind or category missing from the priority lists", () => {
    expect(() => dedupe([rec({ category: "sports" })], { ...priorities, kindPriority: [...priorities.kindPriority] })).toThrow();
  });
});

describe("isTooWide", () => {
  it("keeps a millennium-precision date, which spans exactly 1,000 years", () => {
    const i = effectiveInterval(-1000, 6); // 1st millennium BCE: -1000..-1
    expect(isTooWide({ startYear: i.start, endYear: i.end })).toBe(false);
  });

  it("drops a ten-millennia span", () => {
    expect(isTooWide({ startYear: 1, endYear: 10000 })).toBe(true);
  });

  it("counts years across 1 BCE / 1 CE without a year 0", () => {
    expect(isTooWide({ startYear: -500, endYear: 500 })).toBe(false); // exactly 1,000 years
    expect(isTooWide({ startYear: -500, endYear: 501 })).toBe(true);
  });
});

describe("toRow", () => {
  it("maps a record to a valid row", () => {
    expect(toRow(rec({ description: "490 BCE battle" }))).toMatchObject({ qid: "Q1", start_year: -490, description: "490 BCE battle", wikipedia_title: null });
  });

  it("rejects year 0, reversed intervals, bad coordinates, and unknown kinds", () => {
    expect(() => toRow(rec({ startYear: 0 }))).toThrow();
    expect(() => toRow(rec({ startYear: -400, endYear: -500 }))).toThrow();
    expect(() => toRow(rec({ lat: 95 }))).toThrow();
    expect(() => toRow(rec({ kind: "sports" as EventRecord["kind"] }))).toThrow();
  });
});

describe("writeDatabase", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chronoglobe-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const centuryItem = () => {
    const i = effectiveInterval(-450, 7); // 5th century BCE: -500..-401
    return toRow(rec({ qid: "Q2", startYear: i.start, endYear: i.end, origYear: -450, yearPrecision: 7 }));
  };

  it("writes rows that the overlap filter finds, including century-precision items", () => {
    const path = join(dir, "a.db");
    writeDatabase(path, [toRow(rec({})), centuryItem()], { built_at: "test" });
    const db = new Database(path, { readonly: true });
    const overlap = db.prepare("SELECT qid FROM events WHERE start_year <= @to AND end_year >= @from ORDER BY qid");
    expect(overlap.all({ from: -420, to: -300 }).map((r) => (r as { qid: string }).qid)).toEqual(["Q2"]); // only the century item reaches -420
    expect(overlap.all({ from: -495, to: -485 }).map((r) => (r as { qid: string }).qid)).toEqual(["Q1", "Q2"]);
    expect(db.prepare("SELECT value FROM build_info WHERE key = 'built_at'").get()).toEqual({ value: "test" });
    db.close();
  });

  it("carries cached narratives over from the previous database", () => {
    const old = join(dir, "old.db");
    writeDatabase(old, [toRow(rec({}))], {});
    const o = new Database(old);
    o.prepare("INSERT INTO narratives VALUES ('k1', 'body', '[\"Q1\"]', 'model', 'v1', '2026-10-28')").run();
    o.close();
    const fresh = join(dir, "new.db");
    writeDatabase(fresh, [toRow(rec({}))], {}, old);
    const db = new Database(fresh, { readonly: true });
    expect(db.prepare("SELECT cache_key, body FROM narratives").all()).toEqual([{ cache_key: "k1", body: "body" }]);
    db.close();
  });
});

describe("runSpotChecks", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chronoglobe-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes correct items and flags a wrong year, a wrong place, and a missing item", () => {
    const [marathon, thermopylae, vesuvius] = SPOT_CHECKS;
    const at = (s: (typeof SPOT_CHECKS)[number], over: Partial<EventRecord> = {}) =>
      toRow(rec({ qid: s.qid, startYear: s.year, endYear: s.year, origYear: s.year, lat: (s.box.south + s.box.north) / 2, lon: (s.box.west + s.box.east) / 2, ...over }));
    const path = join(dir, "s.db");
    writeDatabase(path, [at(marathon), at(thermopylae, { startYear: -479, endYear: -479 }), at(vesuvius, { lat: 0, lon: 0 })], {});
    const db = new Database(path, { readonly: true });
    const results = runSpotChecks(db);
    db.close();
    expect(results.map((r) => r.ok)).toEqual([true, false, false, false]);
    expect(results[1].detail).toContain("WRONG YEAR");
    expect(results[2].detail).toContain("WRONG PLACE");
    expect(results[3].detail).toContain("missing");
  });
});
