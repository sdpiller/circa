import { describe, expect, it } from "vitest";
import { apparentZoom, FADE_MS, LABEL_GROUPS, labelGroupOn } from "../lib/labels.ts";

describe("apparentZoom", () => {
  it("equals the zoom at the equator", () => {
    expect(apparentZoom(3.35, 0)).toBe(3.35);
  });

  it("holds still across the measured drag from Africa to high latitude (spec 3.3)", () => {
    expect(Math.abs(apparentZoom(2.02, 66.55) - 3.35)).toBeLessThan(0.02);
  });

  it("stays finite at the pole", () => {
    expect(Number.isFinite(apparentZoom(2, 90))).toBe(true);
  });
});

describe("labelGroupOn", () => {
  it("turns on only past the threshold plus the dead band", () => {
    expect(labelGroupOn(false, 3.2, 3.15)).toBe(false);
    expect(labelGroupOn(false, 3.24, 3.15)).toBe(true);
  });

  it("turns off only below the threshold minus the dead band", () => {
    expect(labelGroupOn(true, 3.1, 3.15)).toBe(true);
    expect(labelGroupOn(true, 3.06, 3.15)).toBe(false);
  });
});

describe("LABEL_GROUPS", () => {
  it("matches the table in spec 3.3", () => {
    expect(LABEL_GROUPS).toEqual([
      { at: 3.15, layers: ["label_country_1", "label_country_2", "label_country_3"] },
      { at: 3.9, layers: ["water_name_point_label", "water_name_line_label"] },
      { at: 5.2, layers: ["label_city_capital"] },
      { at: 6.0, layers: ["label_city", "label_state"] },
      { at: 8.0, layers: ["label_town"] },
      { at: 10.5, layers: ["label_village"] },
      { at: 12.0, layers: ["label_other", "waterway_line_label"] },
    ]);
  });

  it("fades over 320 ms", () => {
    expect(FADE_MS).toBe(320);
  });
});
