import maplibre from "maplibre-gl/package.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { frameOutline, MAX_FLY_ZOOM, MIN_FLY_ZOOM } from "../lib/camera.ts";

const VIEW = { width: 1440, height: 900, panelWidth: 420 };
type Box = [number, number, number, number];
const GREECE: Box = [19.4, 34.8, 28.2, 41.7];

describe("frameOutline", () => {
  it("aims at the middle of the bounds", () => {
    const [lon, lat] = frameOutline(GREECE, VIEW).center;
    expect(lon).toBeCloseTo(23.8, 10);
    expect(lat).toBeCloseTo(38.25, 10);
  });

  it("fits a tall box to the free height: the dates' room and the margins come off", () => {
    // 730 free less 90 of margins leaves a radius of 320 / sin(half height), near enough for a small box.
    const { zoom } = frameOutline([-1, -5, 1, 5], VIEW);
    const radius = 320 / Math.sin((5 * Math.PI) / 180);
    expect(zoom).toBeCloseTo(Math.log2((radius * 2 * Math.PI) / 512), 3);
  });

  it("fits a wide box to the free width: the panel's room and the margins come off", () => {
    const { zoom } = frameOutline([-15, -1, 15, 1], VIEW);
    const radius = 450 / Math.sin((15 * Math.PI) / 180);
    expect(zoom).toBeCloseTo(Math.log2((radius * 2 * Math.PI) / 512), 2);
  });

  it("finds a box's widest point when it is not a corner", () => {
    // Widest on the equator: sin 60 = 0.866 of the radius, against 0.557 at the corners. Tall enough a window
    // that width is what limits; at 900 high the height limits, and the corners give the same zoom.
    const { zoom } = frameOutline([-60, -50, 60, 50], { width: 1440, height: 1200, panelWidth: 420 });
    const radius = 450 / Math.sin((60 * Math.PI) / 180);
    expect(zoom).toBeCloseTo(Math.log2((radius * 2 * Math.PI) / 512), 6);
  });

  it("gets closer as the panel leaves more room, when width is what limits", () => {
    const box: Box = [-15, -1, 15, 1];
    expect(frameOutline(box, { ...VIEW, panelWidth: 200 }).zoom).toBeGreaterThan(frameOutline(box, VIEW).zoom);
  });

  it("lowers the zoom toward the poles, where MapLibre draws the same zoom larger", () => {
    const at = (lat: number): number => frameOutline([-3, lat - 3, 3, lat + 3], VIEW).zoom;
    const apparent = (lat: number) => at(lat) - Math.log2(Math.cos((lat * Math.PI) / 180));
    expect(at(60)).toBeLessThan(at(0));
    expect(apparent(60)).toBeCloseTo(apparent(0), 1);
  });

  it("treats a box across 180 as it treats the same box anywhere else", () => {
    const across = frameOutline([170, 40, 190, 50], VIEW);
    expect(across.zoom).toBeCloseTo(frameOutline([-10, 40, 10, 50], VIEW).zoom, 10);
    expect(across.center).toEqual([180, 45]);
  });

  it("clamps a tiny area in and a huge one out", () => {
    expect(frameOutline([23.7, 37.9, 23.8, 38], VIEW).zoom).toBe(MAX_FLY_ZOOM);
    expect(frameOutline([-180, -80, 180, 80], { width: 1000, height: 600, panelWidth: 360 }).zoom).toBe(MIN_FLY_ZOOM);
  });

  it("does not break on a single point or a window with no free room", () => {
    expect(frameOutline([10, 10, 10, 10], VIEW).zoom).toBe(MAX_FLY_ZOOM);
    expect(frameOutline(GREECE, { width: 300, height: 200, panelWidth: 108 }).zoom).toBe(MIN_FLY_ZOOM);
  });
});

describe("the MapLibre version frameOutline was measured against", () => {
  it("is still the installed one", () => {
    // The tests above re-derive the formula, so they would pass even if MapLibre changed its scaling.
    expect(
      maplibre.version,
      "frameOutline copies MapLibre's globe radius relation. Re-check getGlobeRadiusPixels in globe_utils.ts and re-measure framing, then update this version.",
    ).toBe("6.16.0");
  });
});
