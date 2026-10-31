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

const keyOf = (p: Position) => `${p[0]},${p[1]}`;

type Edge = { a: string; b: string; pa: Position; pb: Position };

/** Nearest vertex distance between two rings, sampling at most 80 vertices of each. */
function ringGapKm(a: Ring, b: Ring): number {
  const sa = Math.max(1, Math.floor(a.length / MAX_SAMPLES));
  const sb = Math.max(1, Math.floor(b.length / MAX_SAMPLES));
  let best = Infinity;
  for (let i = 0; i < a.length; i += sa) for (let j = 0; j < b.length; j += sb) best = Math.min(best, distanceKm(a[i], b[j]));
  return best;
}

export function buildOutline(
  provinces: OutlineInput[],
  click: Position,
  exempt: ReadonlySet<string>,
): { rings: Ring[]; keptIds: string[]; areaKm2: number } {
  // Every edge of every ring of every province, holes too: a hole filled by another province cancels away.
  const edges = new Map<string, Edge>();
  const counts = new Map<string, number>();
  const owners = new Map<string, Set<string>>();
  const provinceEdges = new Map<string, string[]>();
  for (const prov of provinces) {
    const mine: string[] = [];
    provinceEdges.set(prov.id, mine);
    for (const poly of polygonsOf(prov.geometry)) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const ka = keyOf(ring[i]);
          const kb = keyOf(ring[i + 1]);
          if (ka === kb) continue;
          const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          if (!edges.has(key)) edges.set(key, { a: ka, b: kb, pa: ring[i], pb: ring[i + 1] });
          counts.set(key, (counts.get(key) ?? 0) + 1);
          let set = owners.get(key);
          if (!set) owners.set(key, (set = new Set()));
          set.add(prov.id);
          mine.push(key);
        }
      }
    }
  }

  // An edge seen twice is shared and gone. What remains is the boundary.
  const left: string[] = [];
  const at = new Map<string, string[]>();
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
  const used = new Set<string>();
  const edgeRing = new Map<string, number>();
  const all: Ring[] = [];
  const nextEdge = (v: string) => at.get(v)?.find((k) => !used.has(k));
  for (const first of left) {
    if (used.has(first)) continue;
    const e0 = edges.get(first)!;
    const path: string[] = [e0.a];
    const pathPos: Position[] = [e0.pa];
    const pathEdges: string[] = [];
    const index = new Map<string, number>([[e0.a, 0]]);
    let cur = e0.a;
    for (let key = nextEdge(cur); key; key = nextEdge(cur)) {
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
  }

  // A ring inside an odd number of larger rings is a hole. Drop it.
  const areas = all.map(ringAreaKm2);
  const solid: number[] = [];
  all.forEach((ring, i) => {
    let depth = 0;
    for (let j = 0; j < all.length; j++) {
      if (j !== i && areas[j] > areas[i] && pointInRing(ring[0][0], ring[0][1], all[j])) depth++;
    }
    if (depth % 2 === 0) solid.push(i);
  });
  if (solid.length === 0) return { rings: [], keptIds: [], areaKm2: 0 };

  // The clicked piece: the ring holding the click, or the nearest ring (a coastal click).
  let clicked = solid.find((i) => pointInRing(click[0], click[1], all[i]));
  if (clicked === undefined) {
    let best = Infinity;
    for (const i of solid) {
      for (const p of all[i]) {
        const d = distanceKm(click, p);
        if (d < best) {
          best = d;
          clicked = i;
        }
      }
    }
  }
  const home = all[clicked!];

  // Keep the clicked piece, pieces of exempt provinces, and pieces that are big enough and near.
  const exemptRings = new Set<number>();
  for (const [key, n] of edgeRing) for (const id of owners.get(key) ?? []) if (exempt.has(id)) exemptRings.add(n);
  const kept = solid.filter((i) => i === clicked || exemptRings.has(i) || (areas[i] >= MIN_PIECE_KM2 && ringGapKm(home, all[i]) <= NEAR_PIECE_KM));
  const keptSet = new Set(kept);
  const rings = kept.map((i) => all[i]);

  // A province is listed if it owns an edge of a kept ring, or else if it sits wholly inside one.
  const keptIds = provinces
    .filter((prov) => {
      const ownsEdge = (provinceEdges.get(prov.id) ?? []).some((k) => {
        const n = edgeRing.get(k);
        return n !== undefined && keptSet.has(n);
      });
      if (ownsEdge) return true;
      const p = polygonsOf(prov.geometry)[0]?.[0]?.[0];
      return p !== undefined && rings.some((r) => pointInRing(p[0], p[1], r));
    })
    .map((prov) => prov.id);

  // The area on screen: outer rings only, so a hole inside counts.
  return { rings, keptIds, areaKm2: kept.reduce((sum, i) => sum + areas[i], 0) };
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
