import { describe, expect, it } from "vitest";
import { RANGE_H } from "../lib/camera.ts";
import { insetsFor, MASTHEAD_H, panelWidth } from "../lib/layout.ts";

describe("panelWidth", () => {
  it("is unchanged on desktop: 36% of the window, at most 420", () => {
    expect(panelWidth(1440)).toBe(420);
    expect(panelWidth(1024)).toBeCloseTo(368.64, 10);
  });

  it("never squeezes below 320 on a tablet", () => {
    expect(panelWidth(768)).toBe(320);
  });
});

describe("insetsFor", () => {
  it("keeps the wide layout's panel on the right and the dates at the bottom", () => {
    expect(insetsFor(false, 1440, 900)).toEqual({ top: 0, right: 420, bottom: RANGE_H });
  });

  it("puts a phone's sheet at the bottom, half the window, below the masthead", () => {
    expect(insetsFor(true, 390, 844)).toEqual({ top: MASTHEAD_H, right: 0, bottom: 422 });
  });
});
