import { cellToBoundary, cellToParent, getResolution, isValidCell, latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import {
  cellAcrossKm,
  cellPolygon,
  cellsForPoint,
  GRID_MIN_ZOOM,
  groundSelection,
  isGridCell,
  RESOLUTIONS,
  resolutionForZoom,
  zoomForRes,
} from "../lib/cells.ts";

const span = (ring: [number, number][]) => {
  const lons = ring.map((p) => p[0]);
  return Math.max(...lons) - Math.min(...lons);
};

describe("resolutionForZoom", () => {
  it("maps zoom bands to resolutions", () => {
    expect(GRID_MIN_ZOOM).toBe(3);
    expect(resolutionForZoom(2.99)).toBeNull();
    expect(resolutionForZoom(3)).toBe(2);
    expect(resolutionForZoom(4.29)).toBe(2);
    expect(resolutionForZoom(4.3)).toBe(3);
    expect(resolutionForZoom(5.6)).toBe(4);
    expect(resolutionForZoom(7)).toBe(5);
    expect(resolutionForZoom(22)).toBe(5);
  });
});

describe("cellsForPoint", () => {
  it("returns valid nested cells at every grid resolution", () => {
    const c = cellsForPoint(37.97, 23.73);
    for (const r of RESOLUTIONS) {
      const cell = c[`h3_r${r}` as const];
      expect(isValidCell(cell)).toBe(true);
      expect(getResolution(cell)).toBe(r);
    }
    expect(cellToParent(c.h3_r5, 2)).toBe(c.h3_r2);
  });
});

describe("isGridCell", () => {
  it("accepts grid resolutions only", () => {
    expect(isGridCell(cellsForPoint(37.97, 23.73).h3_r4)).toBe(true);
    expect(isGridCell("zzz")).toBe(false);
    expect(isGridCell("")).toBe(false);
    expect(isGridCell(latLngToCell(37.97, 23.73, 6))).toBe(false);
  });
});

describe("cellAcrossKm", () => {
  it("is about 20 km at r5 and decreases with resolution", () => {
    expect(cellAcrossKm(5)).toBeGreaterThanOrEqual(15);
    expect(cellAcrossKm(5)).toBeLessThanOrEqual(21);
    for (let i = 1; i < RESOLUTIONS.length; i++) {
      expect(cellAcrossKm(RESOLUTIONS[i])).toBeLessThan(cellAcrossKm(RESOLUTIONS[i - 1]));
    }
  });
});

describe("cellPolygon", () => {
  it("draws an antimeridian cell as one hexagon", () => {
    // Find a resolution 2 cell whose raw boundary really wraps across 180.
    const candidates = [179.95, 180, -179.99, 179.5, -179.5, 179, -179];
    const cell = candidates
      .map((lon) => latLngToCell(-17.7, lon, 2))
      .find((c) => span(cellToBoundary(c, true) as [number, number][]) > 180);
    expect(cell).toBeDefined();
    const ring = cellPolygon(cell!);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(span(ring)).toBeLessThan(10);
  });

  it("keeps an ordinary cell in place", () => {
    const ring = cellPolygon(cellsForPoint(37.97, 23.73).h3_r4);
    for (const [lon] of ring) {
      expect(lon).toBeGreaterThanOrEqual(23);
      expect(lon).toBeLessThanOrEqual(25);
    }
  });
});

describe("groundSelection", () => {
  const ATHENS = { lat: 37.98, lng: 23.72 };
  const hit = cellsForPoint(ATHENS.lat, ATHENS.lng).h3_r4;

  it("selects the grid cell under the click", () => {
    expect(groundSelection(hit, true, ATHENS.lng, ATHENS.lat, 4)).toEqual({ kind: "cell", cell: hit });
  });

  it("says nothing is documented only when the grid on screen is current", () => {
    expect(groundSelection(undefined, true, ATHENS.lng, ATHENS.lat, 4)).toEqual({ kind: "empty", lngLat: [ATHENS.lng, ATHENS.lat] });
  });

  it("asks the server for the cell under the click while the grid is loading or failed", () => {
    expect(groundSelection(undefined, false, ATHENS.lng, ATHENS.lat, 5)).toEqual({
      kind: "cell",
      cell: latLngToCell(ATHENS.lat, ATHENS.lng, 5),
    });
  });
});

describe("zoomForRes", () => {
  it("lands inside the band of each resolution", () => {
    for (const res of RESOLUTIONS) expect(resolutionForZoom(zoomForRes(res))).toBe(res);
  });
});
