/**
 * Merge provinces into one outline by cancelling the edges two provinces share (design section 5.3).
 * What is left is the outer boundary; the fill uses the same rings. Simplify only after merging.
 */
import { distanceKm, pointInRing, polygonsOf, ringAreaKm2 } from "./geometry.ts";
import type { AreaGeometry, Position, Ring } from "./geometry.ts";

export type OutlineInput = { id: string; geometry: AreaGeometry };

/** Pieces smaller than this (km2) are dropped unless clicked or exempt. */
export const MIN_PIECE_KM2 = 350;
/** Pieces farther than this (km) from the clicked piece are dropped unless exempt. */
export const NEAR_PIECE_KM = 120;

const MAX_SAMPLES = 80;

type Box = [west: number, south: number, east: number, north: number];
type Edge = { a: number; b: number; pa: Position; pb: Position };

/**
 * Gives each distinct coordinate pair a small integer. Matching is exact, as it must be for edges to
 * cancel. Strings did the same job and took most of a merge's time.
 */
function vertexIds(capacity: number): (p: Position) => number {
  const size = 2 ** Math.ceil(Math.log2(capacity * 2 + 1));
  const slots = new Int32Array(size).fill(-1);
  const lons = new Float64Array(capacity);
  const lats = new Float64Array(capacity);
  let count = 0;
  return ([lon, lat]) => {
    let h = (Math.imul((lon * 1e5) | 0, 73856093) ^ Math.imul((lat * 1e5) | 0, 19349663)) & (size - 1);
    for (;;) {
      const id = slots[h];
      if (id < 0) {
        slots[h] = count;
        lons[count] = lon;
        lats[count] = lat;
        return count++;
      }
      if (lons[id] === lon && lats[id] === lat) return id;
      h = (h + 1) & (size - 1);
    }
  };
}

function ringBox(ring: Ring): Box {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

/** A lower bound on the distance between two boxes, in km, so that far pieces skip the vertex comparison. */
function boxGapKm(a: Box, b: Box): number {
  const dLat = Math.max(0, a[1] - b[3], b[1] - a[3]);
  const dLon = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const around = Math.min(dLon, 360 - (Math.max(a[2], b[2]) - Math.min(a[0], b[0])));
  const widest = Math.max(Math.abs(a[1]), Math.abs(a[3]), Math.abs(b[1]), Math.abs(b[3]));
  return Math.max(dLat * 110, Math.max(0, around) * 110 * Math.cos((widest * Math.PI) / 180));
}

/** Whether two rings have vertices within km of each other, sampling at most 80 vertices of each. */
function ringsNear(a: Ring, b: Ring, km: number): boolean {
  const sa = Math.max(1, Math.ceil(a.length / MAX_SAMPLES));
  const sb = Math.max(1, Math.ceil(b.length / MAX_SAMPLES));
  for (let i = 0; i < a.length; i += sa) for (let j = 0; j < b.length; j += sb) if (distanceKm(a[i], b[j]) <= km) return true;
  return false;
}

/**
 * Up to nine edge midpoints of a ring. A ring that touches a larger one at a vertex has that vertex
 * on the larger ring's boundary, where a ray cast is undefined. Midpoints are off it, and a majority
 * vote absorbs an edge that happens to run along the boundary.
 */
function probePoints(ring: Ring): Position[] {
  const edges = ring.length - 1;
  const step = Math.max(1, Math.ceil(edges / 9));
  const out: Position[] = [];
  for (let i = 0; i < edges; i += step) out.push([(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2]);
  return out;
}

/** Whether more than half of the points are in the ring, stopping as soon as the vote is decided. */
function mostInside(points: Position[], ring: Ring): boolean {
  let yes = 0;
  let no = 0;
  for (const p of points) {
    if (pointInRing(p[0], p[1], ring)) yes++;
    else no++;
    if (yes * 2 > points.length) return true;
    if (no * 2 >= points.length) return false;
  }
  return false;
}

/** `openChains` counts walks that dead-ended and were dropped: with clean input it is 0. */
export function buildOutline(
  provinces: OutlineInput[],
  click: Position,
  exempt: ReadonlySet<string>,
): { rings: Ring[]; keptIds: string[]; areaKm2: number; openChains: number } {
  // Every edge of every ring of every province, holes too: a hole filled by another province cancels away.
  const polygons = provinces.map((prov) => polygonsOf(prov.geometry));
  const vertices = polygons.reduce((sum, polys) => sum + polys.reduce((n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0), 0), 0);
  const idOf = vertexIds(vertices);
  const edges = new Map<number, Edge>();
  const counts = new Map<number, number>();
  const provinceEdges = new Map<string, number[]>();
  for (const [p, prov] of provinces.entries()) {
    const mine: number[] = [];
    provinceEdges.set(prov.id, mine);
    for (const poly of polygons[p]) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const ka = idOf(ring[i]);
          const kb = idOf(ring[i + 1]);
          if (ka === kb) continue;
          const key = ka < kb ? ka * vertices + kb : kb * vertices + ka;
          if (!edges.has(key)) edges.set(key, { a: ka, b: kb, pa: ring[i], pb: ring[i + 1] });
          counts.set(key, (counts.get(key) ?? 0) + 1);
          mine.push(key);
        }
      }
    }
  }

  // An edge seen twice is shared and gone. What remains is the boundary.
  const left: number[] = [];
  const at = new Map<number, number[]>();
  for (const [key, n] of counts) {
    if (n > 1) continue;
    left.push(key);
    const e = edges.get(key)!;
    for (const v of [e.a, e.b]) {
      const list = at.get(v);
      if (list) list.push(key);
      else at.set(v, [key]);
    }
  }

  // Walk the remaining edges into rings. A walk that returns to a vertex on its own path closes a
  // ring there, which is how two shapes touching at a corner become two rings.
  const used = new Set<number>();
  const edgeRing = new Map<number, number>();
  const all: Ring[] = [];
  let openChains = 0;
  const nextEdge = (v: number) => at.get(v)?.find((k) => !used.has(k));
  for (const first of left) {
    if (used.has(first)) continue;
    const e0 = edges.get(first)!;
    const path: number[] = [e0.a];
    const pathPos: Position[] = [e0.pa];
    const pathEdges: number[] = [];
    const index = new Map<number, number>([[e0.a, 0]]);
    let cur = e0.a;
    for (let key = nextEdge(cur); key !== undefined; key = nextEdge(cur)) {
      used.add(key);
      const e = edges.get(key)!;
      const [to, toPos] = e.a === cur ? [e.b, e.pb] : [e.a, e.pa];
      pathEdges.push(key);
      const i = index.get(to);
      if (i === undefined) {
        index.set(to, path.length);
        path.push(to);
        pathPos.push(toPos);
      } else {
        const ring = [...pathPos.slice(i), toPos];
        if (ring.length >= 4) {
          for (const k of pathEdges.slice(i)) edgeRing.set(k, all.length);
          all.push(ring);
        }
        for (const v of path.slice(i + 1)) index.delete(v);
        path.length = i + 1;
        pathPos.length = i + 1;
        pathEdges.length = i;
      }
      cur = to;
    }
    // Out of edges away from where the walk began: a dead end, dropped.
    if (pathEdges.length > 0) openChains++;
  }

  if (all.length === 0) return { rings: [], keptIds: [], areaKm2: 0, openChains };

  // A ring inside an odd number of larger rings is a hole. Asked only of rings that could be kept: a
  // province can have hundreds of tiny islands, and each probe is a walk around every larger ring.
  const areas = all.map(ringAreaKm2);
  const boxes = all.map(ringBox);
  const solid = (i: number) => {
    const probes = probePoints(all[i]);
    const [west, south, east, north] = boxes[i];
    let depth = 0;
    for (let j = 0; j < all.length; j++) {
      if (j === i || areas[j] <= areas[i]) continue;
      const [w, s, e, n] = boxes[j];
      if (west < w || south < s || east > e || north > n) continue;
      if (mostInside(probes, all[j])) depth++;
    }
    return depth % 2 === 0;
  };

  // The clicked piece: the ring holding the click, or the nearest ring (a coastal click).
  let clicked = all.findIndex((ring, i) => pointInRing(click[0], click[1], ring) && solid(i));
  if (clicked < 0) {
    let best = Infinity;
    all.forEach((ring, i) => {
      let d = Infinity;
      for (const p of ring) d = Math.min(d, distanceKm(click, p));
      if (d < best && solid(i)) {
        best = d;
        clicked = i;
      }
    });
  }
  const home = all[clicked];

  // Keep the clicked piece, pieces of exempt provinces, and pieces that are big enough and near.
  const exemptRings = new Set<number>();
  for (const id of exempt) {
    for (const key of provinceEdges.get(id) ?? []) {
      const n = edgeRing.get(key);
      if (n !== undefined) exemptRings.add(n);
    }
  }
  const kept = all.map((_, i) => i).filter((i) => {
    if (i === clicked) return true;
    if (!exemptRings.has(i) && areas[i] < MIN_PIECE_KM2) return false;
    return solid(i) && (exemptRings.has(i) || (boxGapKm(boxes[clicked], boxes[i]) <= NEAR_PIECE_KM && ringsNear(home, all[i], NEAR_PIECE_KM)));
  });
  const keptSet = new Set(kept);
  const rings = kept.map((i) => all[i]);

  // A province is listed if it owns an edge of a kept ring, or else if any of its polygons sits inside one, most likely the largest.
  const largestFirst = [...kept].sort((a, b) => areas[b] - areas[a]).map((i) => all[i]);
  const keptIds = provinces
    .filter((prov) => {
      const ownsEdge = (provinceEdges.get(prov.id) ?? []).some((k) => {
        const n = edgeRing.get(k);
        return n !== undefined && keptSet.has(n);
      });
      if (ownsEdge) return true;
      return polygonsOf(prov.geometry).some(([outer]) => {
        const probes = probePoints(outer);
        return largestFirst.some((r) => mostInside(probes, r));
      });
    })
    .map((prov) => prov.id);

  // The area on screen: outer rings only, so a hole inside counts.
  return { rings, keptIds, areaKm2: kept.reduce((sum, i) => sum + areas[i], 0), openChains };
}

/** Every ring simplified; rings that collapse below a triangle are dropped, and a polygon goes with its outer ring. */
export function simplifyGeometry(g: AreaGeometry, toleranceDeg: number): { type: "MultiPolygon"; coordinates: Ring[][] } {
  const coordinates: Ring[][] = [];
  for (const [outer, ...holes] of polygonsOf(g)) {
    const o = simplifyRing(outer, toleranceDeg);
    if (o.length < 4) continue;
    coordinates.push([o, ...holes.map((h) => simplifyRing(h, toleranceDeg)).filter((h) => h.length >= 4)]);
  }
  return { type: "MultiPolygon", coordinates };
}

/** Iterative Douglas-Peucker on a closed ring (first and last vertex equal), so long coastlines cannot overflow the stack. */
export function simplifyRing(r: Ring, toleranceDeg: number): Ring {
  if (r.length < 5) return r;
  const keep = new Uint8Array(r.length);
  const far = Math.floor(r.length / 2);
  keep[0] = keep[r.length - 1] = keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, r.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = r[a];
    const [bx, by] = r[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let best = -1;
    let split = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = r[i];
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      const ex = x - ax - t * dx;
      const ey = y - ay - t * dy;
      const d = ex * ex + ey * ey;
      if (d > best) {
        best = d;
        split = i;
      }
    }
    if (best > toleranceDeg * toleranceDeg) {
      keep[split] = 1;
      stack.push([a, split], [split, b]);
    }
  }
  const out = r.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : r;
}

/**
 * Lines to stroke: each ring cut wherever a segment lies along the antimeridian (both ends at 180
 * or both at -180), so no line is drawn across the map there. The fill keeps the whole rings.
 */
export function boundaryLines(rings: Ring[]): Position[][] {
  const lines: Position[][] = [];
  for (const ring of rings) {
    const runs: Position[][] = [];
    let run: Position[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      if ((a[0] === 180 && b[0] === 180) || (a[0] === -180 && b[0] === -180)) {
        if (run.length) runs.push(run);
        run = [];
        continue;
      }
      if (!run.length) run.push(a);
      run.push(b);
    }
    if (run.length) runs.push(run);
    // The ring's start is arbitrary: join the last run to the first when the cut is elsewhere.
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (runs.length > 1 && first[0] === ring[0] && last[last.length - 1] === ring[ring.length - 1]) {
      runs.shift();
      last.push(...first.slice(1));
    }
    lines.push(...runs);
  }
  return lines;
}

/** West, south, east, north of the rings, with longitudes unwrapped to within 180 of the click, so a shape over the antimeridian gets east above 180. */
export function frameBounds(rings: Ring[], clickLon: number): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lon0, lat] of ring) {
      let lon = lon0;
      while (lon - clickLon > 180) lon -= 360;
      while (clickLon - lon > 180) lon += 360;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return [west, south, east, north];
}
