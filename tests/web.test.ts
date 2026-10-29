import { describe, expect, it } from "vitest";
import { WEB_MAX_LEGS, pickLegs, webOffsets } from "../lib/web.ts";

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
