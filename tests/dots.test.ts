import { describe, expect, it } from "vitest";
import type { Dot } from "../lib/db/events.ts";
import { DOT_GROUPS, groupOf, toFeatureCollection } from "../lib/dots.ts";

const dot = (over: Partial<Dot>): Dot => ({
  qid: "Q31900",
  label: "Battle of Marathon",
  kind: "event",
  category: "conflict",
  start_year: -490,
  end_year: -490,
  lat: 38.1,
  lon: 23.9,
  loc_confidence: "exact",
  sitelinks: 76,
  ...over,
});

describe("groupOf", () => {
  it("splits events by category into conflict, disaster, and politics and society", () => {
    expect(groupOf(dot({ category: "conflict" }))).toBe("conflict");
    expect(groupOf(dot({ category: "disaster" }))).toBe("disaster");
    for (const category of ["politics", "culture", "science", "other"] as const) expect(groupOf(dot({ category }))).toBe("society");
  });

  it("puts discoveries with politics and society, and foundings, structures, births in places and people", () => {
    expect(groupOf(dot({ kind: "discovery", category: "science" }))).toBe("society");
    expect(groupOf(dot({ kind: "founding", category: "founding" }))).toBe("context");
    expect(groupOf(dot({ kind: "structure", category: "culture" }))).toBe("context");
    expect(groupOf(dot({ kind: "birth", category: "culture" }))).toBe("context");
  });

  it("has a legend entry for every group it can return", () => {
    expect(DOT_GROUPS.map((g) => g.key).sort()).toEqual(["conflict", "context", "disaster", "society"]);
  });
});

describe("toFeatureCollection", () => {
  it("builds GeoJSON points with lon first and the properties the layer and tooltip use", () => {
    const fc = toFeatureCollection([dot({ loc_confidence: "inherited" })]);
    expect(fc.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [23.9, 38.1] },
      properties: { qid: "Q31900", label: "Battle of Marathon", group: "conflict", approx: true, years: "490 BCE", what: "conflict", sortKey: 1_000_076 },
    });
  });

  it("describes non-events by what the date means, and draws them beneath events", () => {
    const [structure, birth, event] = toFeatureCollection([
      dot({ kind: "structure", category: "culture", start_year: -447, end_year: -447, sitelinks: 200 }),
      dot({ kind: "birth", category: "culture", sitelinks: 300 }),
      dot({ sitelinks: 1 }),
    ]).features.map((f) => f.properties);
    expect(structure.what).toBe("dated"); // inception is sometimes a rebuild, so never "built" (decisions.md entry 18)
    expect(birth.what).toBe("born here");
    expect(event.sortKey).toBeGreaterThan(structure.sortKey);
    expect(event.sortKey).toBeGreaterThan(birth.sortKey);
  });
});
