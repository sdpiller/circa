import { latLngToCell } from "h3-js";
import { beforeEach, describe, expect, it } from "vitest";
import { AreaQuery, queryArea } from "../lib/db/area.ts";
import { cellAcrossKm, cellsForPoint } from "../lib/cells.ts";
import { makeDb, resetRowCounter, row } from "./helpers.ts";

const ATHENS = { lat: 37.98, lon: 23.72 };
const cell = cellsForPoint(ATHENS.lat, ATHENS.lon).h3_r4;
const base = { cell, from: -3000, to: 2000, eventsLimit: 25, othersLimit: 30 };

beforeEach(resetRowCounter);

describe("queryArea", () => {
  it("returns the top events by sitelinks, sorted by start year then sitelinks, with full totals", () => {
    const db = makeDb([
      row({ ...ATHENS, start_year: -300, end_year: -300, sitelinks: 50, label: "late" }),
      row({ ...ATHENS, start_year: -500, end_year: -500, sitelinks: 10, label: "early low" }),
      row({ ...ATHENS, start_year: -500, end_year: -500, sitelinks: 20, label: "early high" }),
      row({ ...ATHENS, start_year: -400, end_year: -400, sitelinks: 1, label: "dropped" }),
    ]);
    const r = queryArea(db, { ...base, eventsLimit: 3 });
    expect(r.events.map((e) => e.label)).toEqual(["early high", "early low", "late"]);
    expect(r.eventsTotal).toBe(4);
    expect(r.cell).toBe(cell);
    expect(r.res).toBe(4);
    expect(r.acrossKm).toBe(cellAcrossKm(4));
  });

  it("sorts others by sitelinks descending and counts them all", () => {
    const db = makeDb([
      row({ ...ATHENS, kind: "birth", sitelinks: 5 }),
      row({ ...ATHENS, kind: "founding", sitelinks: 9 }),
      row({ ...ATHENS, kind: "structure", sitelinks: 7 }),
    ]);
    const r = queryArea(db, { ...base, othersLimit: 2 });
    expect(r.others.map((o) => o.sitelinks)).toEqual([9, 7]);
    expect(r.othersTotal).toBe(3);
    expect(r.events).toEqual([]);
  });

  it("puts discoveries with events and the rest in others", () => {
    const db = makeDb([
      row({ ...ATHENS, kind: "event" }),
      row({ ...ATHENS, kind: "discovery" }),
      row({ ...ATHENS, kind: "birth" }),
      row({ ...ATHENS, kind: "founding" }),
      row({ ...ATHENS, kind: "structure" }),
    ]);
    const r = queryArea(db, base);
    expect(r.events.map((e) => e.kind).sort()).toEqual(["discovery", "event"]);
    expect(r.others.map((e) => e.kind).sort()).toEqual(["birth", "founding", "structure"]);
  });

  it("filters years by overlap", () => {
    const db = makeDb([row({ ...ATHENS, start_year: -500, end_year: -401 })]);
    expect(queryArea(db, { ...base, from: -450, to: -300 }).eventsTotal).toBe(1);
    expect(queryArea(db, { ...base, from: -401, to: -300 }).eventsTotal).toBe(1);
    expect(queryArea(db, { ...base, from: -500, to: -500 }).eventsTotal).toBe(1);
    expect(queryArea(db, { ...base, from: -400, to: -300 }).eventsTotal).toBe(0);
    expect(queryArea(db, { ...base, from: -900, to: -501 }).eventsTotal).toBe(0);
  });

  it("excludes rows in a neighbouring cell", () => {
    const own = cellsForPoint(ATHENS.lat, ATHENS.lon).h3_r5;
    let other = { lat: ATHENS.lat, lon: ATHENS.lon + 0.2 };
    while (cellsForPoint(other.lat, other.lon).h3_r5 === own) other = { lat: other.lat, lon: other.lon + 0.05 };
    const db = makeDb([row({ ...ATHENS }), row({ ...other })]);
    const r = queryArea(db, { ...base, cell: own });
    expect(r.res).toBe(5);
    expect(r.eventsTotal).toBe(1);
  });

  it("keeps a focused item the limit would cut, and ignores a focus outside the cell or range", () => {
    const db = makeDb([
      row({ ...ATHENS, kind: "birth", sitelinks: 90, label: "famous" }),
      row({ ...ATHENS, kind: "birth", sitelinks: 2, label: "obscure" }),
      row({ ...ATHENS, kind: "birth", sitelinks: 1, label: "out of range", start_year: 1800, end_year: 1800 }),
      row({ lat: -33.9, lon: 151.2, kind: "birth", sitelinks: 3, label: "elsewhere" }),
    ]);
    const find = (label: string) => (db.prepare("SELECT qid FROM events WHERE label = ?").get(label) as { qid: string }).qid;
    const q = { ...base, othersLimit: 1, to: 1000 };
    expect(queryArea(db, q).others.map((o) => o.label)).toEqual(["famous"]);
    const focused = queryArea(db, { ...q, focus: find("obscure") });
    expect(focused.others.map((o) => o.label)).toEqual(["famous", "obscure"]);
    expect(focused.othersTotal).toBe(2);
    expect(queryArea(db, { ...q, focus: find("out of range") }).others).toHaveLength(1);
    expect(queryArea(db, { ...q, focus: find("elsewhere") }).others).toHaveLength(1);
  });

  it("breaks sitelink ties by qid, so equal rows come back in a stable order", () => {
    // Inserted out of qid order, so insertion (rowid) order would give a different answer.
    const db = makeDb([
      row({ ...ATHENS, qid: "Q30", sitelinks: 5 }),
      row({ ...ATHENS, qid: "Q10", sitelinks: 5 }),
      row({ ...ATHENS, qid: "Q20", sitelinks: 5 }),
      row({ ...ATHENS, qid: "Q31", kind: "birth", sitelinks: 5 }),
      row({ ...ATHENS, qid: "Q11", kind: "birth", sitelinks: 5 }),
      row({ ...ATHENS, qid: "Q21", kind: "birth", sitelinks: 5 }),
    ]);
    const r = queryArea(db, { ...base, eventsLimit: 2, othersLimit: 2 });
    expect(r.events.map((e) => e.qid)).toEqual(["Q10", "Q20"]);
    expect(r.others.map((o) => o.qid)).toEqual(["Q11", "Q21"]);
    const all = queryArea(db, base);
    expect(all.events.map((e) => e.qid)).toEqual(["Q10", "Q20", "Q30"]);
    expect(all.others.map((o) => o.qid)).toEqual(["Q11", "Q21", "Q31"]);
  });

  it("does not duplicate a focus item already in the list", () => {
    const db = makeDb([row({ ...ATHENS, kind: "event" })]);
    const qid = (db.prepare("SELECT qid FROM events").get() as { qid: string }).qid;
    expect(queryArea(db, { ...base, focus: qid }).events).toHaveLength(1);
  });

  it("returns empty lists for an empty range, with the cell facts set", () => {
    const db = makeDb([row({ ...ATHENS })]);
    const r = queryArea(db, { ...base, from: 1000, to: 1100 });
    expect(r).toMatchObject({ cell, res: 4, events: [], eventsTotal: 0, others: [], othersTotal: 0 });
    expect(r.acrossKm).toBeGreaterThan(0);
  });
});

describe("AreaQuery", () => {
  const ok = { cell, from: "-500", to: "500" };
  it("accepts a grid cell and applies defaults", () => {
    expect(AreaQuery.parse(ok)).toMatchObject({ cell, from: -500, to: 500, eventsLimit: 25, othersLimit: 30 });
  });
  it("rejects bad input", () => {
    expect(AreaQuery.safeParse({ ...ok, cell: latLngToCell(37.98, 23.72, 6) }).success).toBe(false);
    expect(AreaQuery.safeParse({ ...ok, cell: "abc" }).success).toBe(false);
    expect(AreaQuery.safeParse({ ...ok, eventsLimit: "0" }).success).toBe(false);
    expect(AreaQuery.safeParse({ ...ok, eventsLimit: "201" }).success).toBe(false);
    expect(AreaQuery.safeParse({ ...ok, from: "600" }).success).toBe(false);
    expect(AreaQuery.safeParse({ ...ok, from: "0" }).success).toBe(false);
    expect(AreaQuery.safeParse({ ...ok, focus: "x1" }).success).toBe(false);
  });
});
