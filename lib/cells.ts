import {
  cellToBoundary,
  getHexagonEdgeLengthAvg,
  getResolution,
  isValidCell,
  latLngToCell,
} from "h3-js";

export const GRID_MIN_ZOOM = 3;

export const RESOLUTIONS = [2, 3, 4, 5] as const;
export type Res = (typeof RESOLUTIONS)[number];

// Cells are about 30 to 80 px across on screen in each band.
export const RES_BANDS = [
  { minZoom: 3, res: 2 },
  { minZoom: 4.3, res: 3 },
  { minZoom: 5.6, res: 4 },
  { minZoom: 7, res: 5 },
] as const;

export function resolutionForZoom(zoom: number): Res | null {
  if (zoom < GRID_MIN_ZOOM) return null;
  let res: Res = RES_BANDS[0].res;
  for (const band of RES_BANDS) {
    if (zoom >= band.minZoom) res = band.res;
  }
  return res;
}

export type CellColumns = { h3_r2: string; h3_r3: string; h3_r4: string; h3_r5: string };

export function cellsForPoint(lat: number, lon: number): CellColumns {
  return {
    h3_r2: latLngToCell(lat, lon, 2),
    h3_r3: latLngToCell(lat, lon, 3),
    h3_r4: latLngToCell(lat, lon, 4),
    h3_r5: latLngToCell(lat, lon, 5),
  };
}

/** Roughly how wide a cell is: twice the average edge length, in whole km. */
export function cellAcrossKm(res: Res): number {
  return Math.round(2 * getHexagonEdgeLengthAvg(res, "km"));
}

export function isGridCell(cell: string): boolean {
  if (!isValidCell(cell)) return false;
  return (RESOLUTIONS as readonly number[]).includes(getResolution(cell));
}

/** Closed ring of [lon, lat]. Antimeridian cells are shifted so they draw as one hexagon. */
export function cellPolygon(cell: string): [number, number][] {
  const ring = cellToBoundary(cell, true) as [number, number][];
  const lons = ring.map((p) => p[0]);
  if (Math.max(...lons) - Math.min(...lons) > 180) {
    return ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
  }
  return ring;
}
