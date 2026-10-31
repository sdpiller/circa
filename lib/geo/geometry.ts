/**
 * Small pure geometry helpers for outlines: point in polygon, distance, area and bounding box.
 * Positions are [lon, lat] in degrees, as in GeoJSON. No library is needed for these.
 */

export type Position = [number, number];
export type Ring = Position[];
export type AreaGeometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** A geometry as a list of polygons; each polygon is its outer ring followed by its holes. */
export function polygonsOf(g: AreaGeometry): Ring[][] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

/** Ray casting. A point exactly on an edge may land either way. */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring of some polygon and not inside one of that polygon's holes. */
export function pointInGeometry(lon: number, lat: number, g: AreaGeometry): boolean {
  return polygonsOf(g).some(([outer, ...holes]) => pointInRing(lon, lat, outer) && !holes.some((h) => pointInRing(lon, lat, h)));
}

/** Great-circle distance (haversine) in kilometres. */
export function distanceKm(a: Position, b: Position): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Area of a closed ring on a sphere, in km2. Winding does not matter. */
export function ringAreaKm2(r: Ring): number {
  let sum = 0;
  for (let i = 0; i < r.length - 1; i++) {
    let dLon = r[i + 1][0] - r[i][0];
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    sum += rad(dLon) * (2 + Math.sin(rad(r[i][1])) + Math.sin(rad(r[i + 1][1])));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

export function bboxOf(g: AreaGeometry): [west: number, south: number, east: number, north: number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const poly of polygonsOf(g)) {
    for (const [lon, lat] of poly[0]) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return [west, south, east, north];
}
