import { beforeEach, describe, expect, it } from "vitest";
import { queryCells, CellsQuery } from "../lib/db/cells.ts";
import { cellsForPoint } from "../lib/cells.ts";
import { makeDb, resetRowCounter, row } from "./helpers.ts";

const ATHENS = { lat: 37.98, lon: 23.72 };
const ROME = { lat: 41.9, lon: 12.5 };
const world = { west: -180, east: 180, south: -90, north: 90, from: -3000, to: 2000 };

beforeEach(resetRowCounter);

describe("queryCells", () => {
  it("counts items and events per cell", () => {
    const db = makeDb([
      row({ ...ATHENS, kind: "event" }),
      row({ ...ATHENS, kind: "birth" }),
      row({ ...ROME, kind: "discovery" }),
    ]);
    const { res, cells } = queryCells(db, { ...world, zoom: 7 });
    expect(res).toBe(5);
    expect(cells).toHaveLength(2);
    const byCell = Object.fromEntries(cells.map((c) => [c.cell, c]));
    expect(byCell[cellsForPoint(ATHENS.lat, ATHENS.lon).h3_r5]).toMatchObject({ items: 2, events: 1 });
    expect(byCell[cellsForPoint(ROME.lat, ROME.lon).h3_r5]).toMatchObject({ items: 1, events: 1 });
  });

  it("filters years by overlap", () => {
    const db = makeDb([row({ start_year: -500, end_year: -401 })]);
    const q = { ...world, zoom: 7 };
    expect(queryCells(db, { ...q, from: -450, to: -300 }).cells).toHaveLength(1);
    expect(queryCells(db, { ...q, from: -400, to: -300 }).cells).toHaveLength(0);
  });

  it("finds rows across the antimeridian", () => {
    const db = makeDb([row({ lat: 0, lon: 179.9 })]);
    expect(queryCells(db, { ...world, west: 170, east: -170, zoom: 7 }).cells).toHaveLength(1);
  });

  it("returns nothing below the grid zoom", () => {
    const db = makeDb([row()]);
    expect(queryCells(db, { ...world, zoom: 2.5 })).toEqual({ res: null, cells: [] });
  });

  it("picks the resolution column from the zoom", () => {
    const db = makeDb([row({ ...ATHENS })]);
    const { res, cells } = queryCells(db, { ...world, zoom: 4.3 });
    expect(res).toBe(3);
    expect(cells[0].cell).toBe(cellsForPoint(ATHENS.lat, ATHENS.lon).h3_r3);
  });
});

describe("CellsQuery", () => {
  it("rejects a missing zoom", () => {
    expect(CellsQuery.safeParse({ west: "0", south: "0", east: "1", north: "1", from: "1", to: "2" }).success).toBe(false);
  });
});
