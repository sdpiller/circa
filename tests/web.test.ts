import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { WEB_MAX_LEGS, pickLegs, stackCell, webOffsets } from "../lib/web.ts";

const items = (sitelinks: number[]) => sitelinks.map((s, i) => ({ id: i, sitelinks: s }));

describe("pickLegs", () => {
  it("keeps the 8 most linked, most linked first, and counts the rest", () => {
    const { legs, more } = pickLegs(items([5, 90, 12, 40, 7, 66, 3, 81, 20, 1, 55, 30]));
    expect(WEB_MAX_LEGS).toBe(8);
    expect(legs.map((l) => l.sitelinks)).toEqual([90, 81, 66, 55, 40, 30, 20, 12]);
    expect(more).toBe(4);
  });

  it("returns every item when there are 8 or fewer", () => {
    const { legs, more } = pickLegs(items([3, 9, 1]));
    expect(legs.map((l) => l.sitelinks)).toEqual([9, 3, 1]);
    expect(more).toBe(0);
  });

  it("does not reorder the caller's array", () => {
    const input = items([1, 2, 3]);
    pickLegs(input);
    expect(input.map((l) => l.sitelinks)).toEqual([1, 2, 3]);
  });
});

describe("webOffsets", () => {
  const close = (actual: { x: number; y: number }[], expected: [number, number][]) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((p, i) => {
      expect(Math.abs(p.x - expected[i][0])).toBeLessThan(1e-9);
      expect(Math.abs(p.y - expected[i][1])).toBeLessThan(1e-9);
    });
  };

  it("spaces legs evenly, the first straight up, then clockwise (screen y grows downward)", () => {
    close(webOffsets(4, 50), [[0, -50], [50, 0], [0, 50], [-50, 0]]);
  });

  it("puts a single leg straight up", () => {
    close(webOffsets(1, 50), [[0, -50]]);
  });
});

describe("stackCell", () => {
  // Three places in different r5 cells.
  const athens = { lat: 37.9838, lon: 23.7275 };
  const thebes = { lat: 38.3219, lon: 23.3194 };
  const marathon = { lat: 38.154, lon: 23.963 };
  const cellOf = (p: { lat: number; lon: number }) => latLngToCell(p.lat, p.lon, 5);

  it("uses three places in three different cells", () => {
    expect(new Set([athens, thebes, marathon].map(cellOf)).size).toBe(3);
  });

  it("picks the cell holding the most members, even if a famous member sits elsewhere", () => {
    const members = [
      { ...athens, sitelinks: 5 },
      { ...athens, sitelinks: 3 },
      { ...athens, sitelinks: 1 },
      { ...thebes, sitelinks: 200 },
    ];
    expect(stackCell(members, 5)).toBe(cellOf(athens));
  });

  it("breaks a tie with the cell of the most linked member", () => {
    const members = [
      { ...athens, sitelinks: 10 },
      { ...athens, sitelinks: 20 },
      { ...thebes, sitelinks: 1 },
      { ...thebes, sitelinks: 90 },
      { ...marathon, sitelinks: 500 }, // most linked overall, but not in a tied cell
    ];
    expect(stackCell(members, 5)).toBe(cellOf(thebes));
  });

  it("returns the only member's cell", () => {
    expect(stackCell([{ ...marathon, sitelinks: 7 }], 5)).toBe(cellOf(marathon));
  });

  it("uses the resolution it is given", () => {
    expect(stackCell([{ ...athens, sitelinks: 1 }], 3)).toBe(latLngToCell(athens.lat, athens.lon, 3));
  });
});
