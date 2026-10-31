/**
 * Which province holds a point, or is nearest to it. Pure: the loader passes every province and the
 * API passes the few whose boxes are close (lib/db/provinces.ts).
 */
import { pointInGeometry, polygonsOf, type AreaGeometry, type Position, type Ring } from "./geometry.ts";

export type ProvinceRow = {
  id: string;
  name: string;
  country: string;
  lon: number;
  lat: number;
  west: number;
  south: number;
  east: number;
  north: number;
  area: number;
  geojson: string;
};

type ProvinceBox = Pick<ProvinceRow, "west" | "south" | "east" | "north">;

type Prepared = { row: ProvinceRow; geometry: AreaGeometry };
const preparedCache = new WeakMap<readonly ProvinceRow[], Prepared[]>();

function prepare(provinces: readonly ProvinceRow[]): Prepared[] {
  let p = preparedCache.get(provinces);
  if (!p) {
    p = provinces.map((row) => ({ row, geometry: JSON.parse(row.geojson) as AreaGeometry }));
    preparedCache.set(provinces, p);
  }
  return p;
}

/** Distance in km from a point to a segment, on a local flat projection (fine at a few hundred km). */
function segmentKm(lon: number, lat: number, a: Position, b: Position): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const wrap = (d: number) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  const ax = wrap(a[0] - lon) * kx;
  const ay = (a[1] - lat) * ky;
  const bx = wrap(b[0] - lon) * kx;
  const by = (b[1] - lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function ringDistanceKm(lon: number, lat: number, ring: Ring): number {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) best = Math.min(best, segmentKm(lon, lat, ring[i], ring[i + 1]));
  return best;
}

/** Whether the point is within about maxKm of the box, looking both ways across the antimeridian. */
export function nearBox(r: ProvinceBox, lon: number, lat: number, maxKm: number): boolean {
  const dLat = maxKm / 110;
  if (lat < r.south - dLat || lat > r.north + dLat) return false;
  const dLon = Math.min(180, maxKm / (111 * Math.max(0.05, Math.cos((lat * Math.PI) / 180))));
  return [lon, lon + 360, lon - 360].some((x) => x >= r.west - dLon && x <= r.east + dLon);
}

/** The province containing the point, or null. Where provinces overlap, the smallest wins. */
export function containingProvince(provinces: readonly ProvinceRow[], lon: number, lat: number): ProvinceRow | null {
  let inside: ProvinceRow | null = null;
  for (const p of prepare(provinces)) {
    const r = p.row;
    if (lon < r.west || lon > r.east || lat < r.south || lat > r.north) continue;
    if ((!inside || r.area < inside.area) && pointInGeometry(lon, lat, p.geometry)) inside = r;
  }
  return inside;
}

/** The containing province; else the one whose boundary is nearest, if within maxKm; else null. */
export function nearestProvince(provinces: readonly ProvinceRow[], lon: number, lat: number, maxKm: number): ProvinceRow | null {
  const inside = containingProvince(provinces, lon, lat);
  if (inside) return inside;
  const prepared = prepare(provinces);

  let best: ProvinceRow | null = null;
  let bestKm = maxKm;
  for (const p of prepared) {
    const r = p.row;
    if (!nearBox(r, lon, lat, maxKm)) continue;
    for (const [outer] of polygonsOf(p.geometry)) {
      const d = ringDistanceKm(lon, lat, outer);
      if (d <= bestKm) {
        bestKm = d;
        best = r;
      }
    }
  }
  return best;
}
