import { describe, expect, it } from "vitest";
import type { HoverOutline } from "../lib/db/area.ts";
import { HoverCache } from "../lib/hover.ts";
import { box } from "./helpers.ts";

const answer = (id: string, shape = box(0, 0, 1, 1)): HoverOutline => ({
  holds: { id, shape },
  fill: { type: "MultiPolygon", coordinates: [] },
  lines: { type: "MultiLineString", coordinates: [] },
});
const RANGE = { from: -500, to: -300 };

describe("HoverCache", () => {
  it("finds a held answer anywhere inside its province, and nothing outside", () => {
    const c = new HoverCache();
    c.add(RANGE, answer("A"));
    c.add(RANGE, answer("B", box(1, 0, 2, 1)));
    expect(c.find(RANGE, [0.2, 0.9])?.holds?.id).toBe("A");
    expect(c.find(RANGE, [1.5, 0.5])?.holds?.id).toBe("B");
    expect(c.find(RANGE, [3, 0.5])).toBeUndefined();
  });

  it("holds answers for one range: another range finds nothing, and empties the cache", () => {
    const c = new HoverCache();
    c.add(RANGE, answer("A"));
    expect(c.find({ from: -500, to: -301 }, [0.5, 0.5])).toBeUndefined();
    expect(c.find(RANGE, [0.5, 0.5])).toBeUndefined();
  });

  it("does not keep an answer that holds only at its own point", () => {
    const c = new HoverCache();
    c.add(RANGE, { ...answer("A"), holds: null });
    expect(c.find(RANGE, [0.5, 0.5])).toBeUndefined();
  });

  it("forgets the oldest answer past its size", () => {
    const c = new HoverCache(2);
    c.add(RANGE, answer("A"));
    c.add(RANGE, answer("B", box(1, 0, 2, 1)));
    c.add(RANGE, answer("C", box(2, 0, 3, 1)));
    expect(c.find(RANGE, [0.5, 0.5])).toBeUndefined();
    expect(c.find(RANGE, [2.5, 0.5])?.holds?.id).toBe("C");
  });
});
