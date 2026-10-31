import { describe, expect, it } from "vitest";
import { chooseRegion, MAX_SPAN_YEARS, type RegionRow } from "../lib/outline/choose.ts";
import { ATLAS_LINE, scaleLine } from "../lib/outline/scale.ts";

let nextId = 1;
function clio(name: string, from_year: number, to_year: number, area = 1000): RegionRow {
  return { id: nextId++, source: "cliopatria", name, from_year, to_year, area };
}
function base(name: string, from_year: number, to_year: number, area = 1000): RegionRow {
  return { id: nextId++, source: "basemaps", name, from_year, to_year, area };
}

describe("chooseRegion", () => {
  it("exports the span limit", () => {
    expect(MAX_SPAN_YEARS).toBe(500);
  });

  it("returns null when there are no rows", () => {
    expect(chooseRegion([], -100, 100)).toBeNull();
  });

  it("prefers the Cliopatria name that held the spot, even over a basemaps row", () => {
    const a = clio("Rome", -100, -50);
    const b = clio("Rome", -49, 50);
    const bm = base("Italia", -150, 150);
    expect(chooseRegion([bm, a, b], -100, 100)?.name).toBe("Rome");
  });

  it("accepts a name that holds exactly half of the range", () => {
    const a = clio("A", 1, 50);
    const bm = base("Other", 1, 100);
    expect(chooseRegion([a, bm], 1, 100)).toBe(a);
  });

  it("lets basemaps beat a short Cliopatria polity", () => {
    const pl = clio("Peloponnesian League", -404, -384);
    const gr = base("Greek city-states", -450, -350);
    expect(chooseRegion([pl, gr], -500, -300)).toBe(gr);
  });

  it("does not count the same years twice for one name", () => {
    const a1 = clio("A", 1, 50);
    const a2 = clio("A", 1, 50);
    const bm = base("Middle", 60, 90);
    expect(chooseRegion([a1, a2, bm], 1, 150)).toBe(bm);
  });

  it("clips held years to the range", () => {
    const a = clio("A", -1000, 40);
    const bm = base("Other", 1, 100);
    // held in range: 1..40 = 40 of 100 years, short of half
    expect(chooseRegion([a, bm], 1, 100)).toBe(bm);
  });

  it("falls back to Cliopatria at the midpoint when no basemaps row exists", () => {
    const a = clio("A", 40, 60);
    expect(chooseRegion([a], 1, 100)).toBe(a);
  });

  it("picks the smaller area among short Cliopatria rows at the midpoint", () => {
    const big = clio("Big", 40, 60, 5000);
    const small = clio("Small", 45, 55, 200);
    expect(chooseRegion([big, small], 1, 100)).toBe(small);
  });

  it("returns null when a short Cliopatria row misses the midpoint", () => {
    expect(chooseRegion([clio("A", 1, 20)], 1, 100)).toBeNull();
  });

  it("ignores a basemaps row that does not contain the midpoint", () => {
    expect(chooseRegion([base("Far", 1, 20)], 1, 100)).toBeNull();
  });

  it("returns the row of the chosen name nearest the midpoint", () => {
    const early = clio("Rome", -100, -50);
    const late = clio("Rome", -49, 50);
    // midpoint of -100..100 is -1 (or near), inside the late row
    expect(chooseRegion([early, late], -100, 100)).toBe(late);
    expect(chooseRegion([late, early], -100, 100)).toBe(late);
  });
});

describe("scaleLine", () => {
  it("describes a historical outline", () => {
    expect(scaleLine({ kind: "historical", areaKm2: 130499, capped: false })).toBe(
      "about 130,000 km², approximate, built from modern provinces",
    );
    expect(scaleLine({ kind: "historical", areaKm2: 130499, capped: true })).toBe(
      "about 130,000 km², approximate, built from modern provinces, within 800 km",
    );
  });

  it("describes a modern outline", () => {
    expect(scaleLine({ kind: "modern", areaKm2: 879, capped: true })).toBe(
      "about 880 km², modern borders, within 800 km",
    );
    expect(scaleLine({ kind: "modern", areaKm2: 879, capped: false })).toBe("about 880 km², modern borders");
  });

  it("has the atlas line", () => {
    expect(ATLAS_LINE).toBe("A broad label from a historical atlas.");
  });
});
