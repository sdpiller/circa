import { describe, expect, it } from "vitest";
import { provinceAt, provinceGeometry, provinceIndex } from "../lib/db/provinces.ts";
import { regionsContaining, regionsContainingEach, regionShapes } from "../lib/db/regions.ts";
import type { AreaGeometry, Position } from "../lib/geo/geometry.ts";
import type { ProvinceRow } from "../lib/geo/provinces.ts";
import type { NewRegion } from "../etl/boundaries-parse.ts";
import { CAP_KM, resolveOutline, type Selection } from "../lib/outline/resolve.ts";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { box, makeGeoDb, province, region, story } from "./helpers.ts";

/** Ten touching one-degree boxes along the equator: P0 is 0 to 1 degrees, P9 is 9 to 10. A box's centre is about 111 km from the next. */
const strip = (): ProvinceRow[] => Array.from({ length: 10 }, (_, i) => province(`P${i}`, box(i, 0, i + 1, 1)));
const CLICK = { lon: 0.5, lat: 0.5 };

function resolve(provinces: ProvinceRow[], regions: NewRegion[], q: { from: number; to: number; story?: PublishedStory | null; click?: Position; clicked?: string }): Selection {
  const db = makeGeoDb([], provinces, regions);
  const [lon, lat] = q.click ?? [CLICK.lon, CLICK.lat];
  const clicked = provinces.find((p) => p.id === (q.clicked ?? "P0"))!;
  return resolveOutline(db, { lon, lat, from: q.from, to: q.to, clicked, story: q.story ?? null });
}

const span = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => `P${first + i}`);
const sorted = (ids: string[]) => [...ids].sort();

describe("resolveOutline: which region", () => {
  it("a Cliopatria region held for the range wins over the atlas", () => {
    const s = resolve(strip(), [region("cliopatria", "Holder", -500, -300, box(0, 0, 3, 1)), region("basemaps", "Atlas", -500, -300, box(0, 0, 6, 1))], { from: -500, to: -300 });
    expect(s).toMatchObject({ kind: "historical", name: "Holder", source: "cliopatria", capped: false });
    expect(sorted(s.provinceIds)).toEqual(span(0, 2));
  });

  it("a short polity loses to an atlas region", () => {
    const s = resolve(strip(), [region("cliopatria", "Short", -404, -384, box(0, 0, 3, 1)), region("basemaps", "Atlas", -500, -300, box(0, 0, 2, 1))], { from: -500, to: -300 });
    expect(s).toMatchObject({ kind: "historical", name: "Atlas", source: "basemaps" });
    expect(sorted(s.provinceIds)).toEqual(span(0, 1));
  });

  it("a Cliopatria row at the middle year is used when nothing else fits", () => {
    const s = resolve(strip(), [region("cliopatria", "Short", -404, -384, box(0, 0, 3, 1))], { from: -500, to: -300 });
    expect(s).toMatchObject({ kind: "historical", name: "Short", source: "cliopatria" });
  });

  it("an atlas region gathers every piece of its name in that snapshot, and only that snapshot", () => {
    const s = resolve(
      strip(),
      [
        region("basemaps", "Atlas", -500, -300, box(0, 0, 2, 1)),
        region("basemaps", "Atlas", -500, -300, box(2, 0, 4, 1)),
        region("basemaps", "Atlas", -299, -100, box(4, 0, 6, 1)),
        region("basemaps", "Other", -500, -300, box(6, 0, 8, 1)),
      ],
      { from: -500, to: -300 },
    );
    expect(sorted(s.provinceIds)).toEqual(span(0, 3));
  });

  it("no region gives the modern country, named for the country, without other countries", () => {
    const provinces = [...strip(), province("ELSE", box(0, 1, 1, 2), { country: "Elsewhere" })];
    const s = resolve(provinces, [], { from: -500, to: -300 });
    expect(s).toMatchObject({ kind: "modern", name: "Testland", source: null });
    expect(s.provinceIds).toContain("P3");
    expect(s.provinceIds).not.toContain("ELSE");
  });

  it("a range over the span limit is modern, and a range at the limit is not", () => {
    const regions = [region("basemaps", "Atlas", -3500, 2026, box(0, 0, 2, 1))];
    expect(resolve(strip(), regions, { from: -500, to: 1 }).kind).toBe("modern"); // 501 years
    expect(resolve(strip(), regions, { from: -500, to: -1 }).kind).toBe("historical"); // 500 years
  });

  it("a story showing keeps the region for its own long years", () => {
    const regions = [region("basemaps", "Atlas", -3500, 2026, box(0, 0, 2, 1))];
    const s = resolve(strip(), regions, { from: -2500, to: -500, story: story("long", ["P0"], -2500, -500) });
    expect(s).toMatchObject({ kind: "historical", name: "Atlas" });
  });

  it("a miss at the click retries at the clicked province's representative point", () => {
    const regions = [region("basemaps", "Inland", -500, -300, box(0.3, 0.3, 0.7, 0.7))];
    const s = resolve(strip(), regions, { from: -500, to: -300, click: [0.9, 0.9] });
    expect(s).toMatchObject({ kind: "historical", name: "Inland" });
  });

  it("goes modern when the representative point misses as well", () => {
    const regions = [region("basemaps", "Inland", -500, -300, box(0.1, 0.1, 0.2, 0.2))];
    expect(resolve(strip(), regions, { from: -500, to: -300, click: [0.9, 0.9] }).kind).toBe("modern");
  });
});

describe("resolveOutline: which provinces", () => {
  it("always holds the clicked province, even when its representative point is outside the region", () => {
    const provinces = [province("P0", box(0, 0, 1, 1), { lon: 0.1, lat: 0.1 }), province("P1", box(1, 0, 2, 1))];
    const s = resolve(provinces, [region("basemaps", "Atlas", -500, -300, box(0.4, 0, 2, 1))], { from: -500, to: -300 });
    expect(sorted(s.provinceIds)).toEqual(["P0", "P1"]);
  });

  it("adds a province within the cap and leaves one past it, and says it was capped", () => {
    expect(CAP_KM).toBe(800);
    // P7's centre is about 778 km from the click, P8's about 890 km
    const s = resolve(strip(), [region("basemaps", "Atlas", -500, -300, box(0, 0, 9, 1))], { from: -500, to: -300 });
    expect(s.provinceIds).toContain("P7");
    expect(s.provinceIds).not.toContain("P8");
    expect(s.capped).toBe(true);
  });

  it("is not capped when nothing in the region is past the cap", () => {
    const s = resolve(strip(), [region("basemaps", "Atlas", -500, -300, box(0, 0, 8, 1))], { from: -500, to: -300 });
    expect(sorted(s.provinceIds)).toEqual(span(0, 7));
    expect(s.capped).toBe(false);
  });

  it("modern borders are capped the same way", () => {
    const s = resolve(strip(), [], { from: -500, to: -300 });
    expect(s.kind).toBe("modern");
    expect(sorted(s.provinceIds)).toEqual(span(0, 7));
    expect(s.capped).toBe(true);
  });

  it("modern borders are not capped by another country's far province", () => {
    const provinces = [province("P0", box(0, 0, 1, 1)), province("FAR", box(20, 0, 21, 1), { country: "Elsewhere" })];
    expect(resolve(provinces, [], { from: -500, to: -300 }).capped).toBe(false);
  });

  it("keeps a story's province past the cap and far from the clicked piece, which does not count as capped", () => {
    const provinces = [province("P0", box(0, 0, 1, 1)), province("FAR", box(40, 0, 41, 1))];
    const s = resolve(provinces, [region("basemaps", "Atlas", -500, -300, box(0, 0, 41, 1))], { from: -500, to: -300, story: story("s", ["P0", "FAR"], -500, -300) });
    expect(sorted(s.provinceIds)).toEqual(["FAR", "P0"]);
    expect(s.capped).toBe(false);
    expect(s.fill.coordinates).toHaveLength(2);
  });

  it("drops a piece far from the clicked one, and its province", () => {
    const provinces = [province("P0", box(0, 0, 1, 1)), province("NEAR", box(1, 0, 2, 1)), province("ISLE", box(5, 0, 6, 1))];
    const s = resolve(provinces, [region("basemaps", "Atlas", -500, -300, box(0, 0, 6, 1))], { from: -500, to: -300 });
    expect(sorted(s.provinceIds)).toEqual(["NEAR", "P0"]);
  });

  it("anchors a click off the coast on the clicked province, not on a closer corner of another", () => {
    // BIG's long south edge is 40 km from the click; its corners are hundreds of km away. SMALL's corner is nearer than those.
    const big = province("BIG", box(0, 0, 8, 8));
    const small = province("SMALL", box(4.5, -1.3, 5.5, -0.6));
    const s = resolve([big, small], [], { from: -500, to: -300, click: [4, -0.36], clicked: "BIG" });
    expect(s.provinceIds).toContain("BIG");
  });
});

describe("resolveOutline: the shape", () => {
  const closed = (r: Position[]) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];

  it("merges touching provinces into one closed ring, with lines, bounds and area", () => {
    const s = resolve(strip(), [region("basemaps", "Atlas", -500, -300, box(0, 0, 3, 1))], { from: -500, to: -300 });
    expect(s.fill.type).toBe("MultiPolygon");
    expect(s.fill.coordinates).toHaveLength(1);
    expect(closed(s.fill.coordinates[0][0])).toBe(true);
    expect(s.lines.type).toBe("MultiLineString");
    expect(s.lines.coordinates.length).toBeGreaterThan(0);
    expect(s.bounds).toEqual([0, 0, 3, 1]);
    expect(s.areaKm2).toBeGreaterThan(36000);
    expect(s.areaKm2).toBeLessThan(38000);
    expect(s.openChains).toBe(0);
  });

  it("simplifies a dense boundary, keeping it closed", () => {
    // A south coast of 2,000 tiny wiggles.
    const coast: Position[] = Array.from({ length: 2001 }, (_, i) => [i * 0.005, i % 2 ? -0.0001 : 0]);
    const ring: Position[] = [...coast, [10, 10], [0, 10], coast[0]];
    const dense: AreaGeometry = { type: "Polygon", coordinates: [ring] };
    const s = resolve([province("P0", dense)], [], { from: -500, to: -300 });
    const out = s.fill.coordinates[0][0];
    expect(out.length).toBeLessThan(100);
    expect(closed(out)).toBe(true);
  });

  it("does not draw a line along the antimeridian", () => {
    const edge = province("P0", box(179, 0, 180, 1));
    const s = resolve([edge], [], { from: -500, to: -300, click: [179.5, 0.5] });
    for (const line of s.lines.coordinates) {
      for (let i = 0; i < line.length - 1; i++) expect(line[i][0] === 180 && line[i + 1][0] === 180).toBe(false);
    }
  });
});

describe("province and region lookups", () => {
  it("provinceIndex holds no geometry and is one array per database", () => {
    const db = makeGeoDb([], strip(), []);
    expect(provinceIndex(db)).toHaveLength(10);
    expect(provinceIndex(db)[0]).not.toHaveProperty("geojson");
    expect(provinceIndex(db)).toBe(provinceIndex(db));
  });

  it("provinceAt finds the containing province, snaps within the limit, else null", () => {
    const db = makeGeoDb([], strip(), []);
    expect(provinceAt(db, 3.5, 0.5)?.id).toBe("P3");
    expect(provinceAt(db, 3.5, 0.5)?.geojson).toContain("Polygon");
    expect(provinceAt(db, 3.5, -0.36)?.id).toBe("P3"); // about 40 km south
    expect(provinceAt(db, 3.5, -0.54)).toBeNull(); // about 60 km south
    expect(provinceAt(db, 3.5, -0.54, 100)?.id).toBe("P3");
  });

  it("provinceAt looks across the antimeridian", () => {
    const db = makeGeoDb([], [province("EAST", box(179, 0, 179.8, 1))], []);
    expect(provinceAt(db, -179.9, 0.5)?.id).toBe("EAST");
  });

  it("provinceGeometry parses a province and refuses an unknown one", () => {
    const db = makeGeoDb([], strip(), []);
    expect(provinceGeometry(db, "P1")).toEqual(box(1, 0, 2, 1));
    expect(() => provinceGeometry(db, "NOPE")).toThrow(/NOPE/);
  });

  it("regionsContaining tests years, the box, and the shape", () => {
    // An L shape: its box holds (1.5, 1.5) but the shape does not.
    const ell: AreaGeometry = { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]] };
    const db = makeGeoDb([], strip(), [region("basemaps", "Ell", -500, -300, ell), region("cliopatria", "Later", 100, 200, box(0, 0, 2, 2))]);
    expect(regionsContaining(db, 0.5, 0.5, -500, -300).map((r) => r.name)).toEqual(["Ell"]);
    expect(regionsContaining(db, 1.5, 1.5, -500, -300)).toEqual([]);
    expect(regionsContaining(db, 0.5, 0.5, -300, 100).map((r) => r.name).sort()).toEqual(["Ell", "Later"]);
    expect(regionsContaining(db, 0.5, 0.5, -500, -300)[0]).not.toHaveProperty("geojson");
  });

  it("regionsContainingEach answers for each point on its own", () => {
    const db = makeGeoDb([], strip(), [region("basemaps", "West", -500, -300, box(0, 0, 1, 1)), region("basemaps", "East", -500, -300, box(5, 0, 6, 1))]);
    const names = regionsContainingEach(db, [[0.5, 0.5], [5.5, 0.5], [3.5, 0.5]], -500, -300).map((rows) => rows.map((r) => r.name));
    expect(names).toEqual([["West"], ["East"], []]);
  });

  it("regionShapes gives one row for Cliopatria and all of a snapshot's pieces for the atlas", () => {
    const db = makeGeoDb([], strip(), [
      region("cliopatria", "Polity", -500, -400, box(0, 0, 1, 1)),
      region("cliopatria", "Polity", -399, -300, box(0, 0, 2, 1)),
      region("basemaps", "Atlas", -500, -300, box(0, 0, 1, 1)),
      region("basemaps", "Atlas", -500, -300, box(5, 0, 6, 1)),
      region("basemaps", "Atlas", -299, -100, box(7, 0, 8, 1)),
    ]);
    const [polity] = regionsContaining(db, 0.5, 0.5, -500, -400).filter((r) => r.source === "cliopatria");
    expect(regionShapes(db, polity)).toEqual([box(0, 0, 1, 1)]);
    const [atlas] = regionsContaining(db, 0.5, 0.5, -500, -400).filter((r) => r.source === "basemaps");
    expect(regionShapes(db, atlas)).toEqual([box(0, 0, 1, 1), box(5, 0, 6, 1)]);
  });
});
