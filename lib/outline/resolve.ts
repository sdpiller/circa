/**
 * From a click and a range to an outline (spec 3.6): choose a region, gather the modern provinces that
 * fall in it within the cap, and merge them. Simplifying happens here, after the merge, never before.
 * The cap is measured from the clicked province's representative point, not the click (decisions.md entry 33),
 * so within one piece of a province the outline changes only where the region does.
 */
import type Database from "better-sqlite3";
import { provinceGeometry, provinceIndex, type ProvinceEntry } from "../db/provinces.ts";
import { regionsContainingEach, regionShapes } from "../db/regions.ts";
import { bboxOf, distanceKm, pointInGeometry, polygonsOf, type AreaGeometry, type Position, type Ring } from "../geo/geometry.ts";
import { boundaryLines, buildOutline, frameBounds, simplifyRing } from "../geo/outline.ts";
import type { ProvinceRow } from "../geo/provinces.ts";
import type { PublishedStory } from "../narrative/publish.ts";
import { yearCount } from "../time/index.ts";
import { CAP_KM } from "./scale.ts";
import { chooseRegion, MAX_SPAN_YEARS, type RegionRow } from "./choose.ts";

/** Rings are simplified to this fraction of the outline's longer side, which holds the payload down at any scale. */
const SIMPLIFY_FRACTION = 1 / 1500;

export type Selection = {
  kind: "historical" | "modern";
  name: string;
  source: "cliopatria" | "basemaps" | null;
  areaKm2: number;
  capped: boolean;
  provinceIds: string[];
  fill: { type: "MultiPolygon"; coordinates: Ring[][] };
  lines: { type: "MultiLineString"; coordinates: Position[][] };
  bounds: [number, number, number, number];
  /** Walks that dead-ended while merging: 0 with clean data. etl/bench-area.ts fails on anything else. */
  openChains: number;
};

/**
 * Steps 2 to 4 of the rule at the click, then once more at the clicked province's representative point, because
 * old shapes miss coasts. `samples` are other points of the clicked piece, asked in the same pass: `uniform` says
 * whether a click at each of them would get the same region.
 */
function findRegion(
  db: Database.Database,
  q: { lon: number; lat: number; from: number; to: number; clicked: ProvinceRow },
  samples: Position[] = [],
): { region: RegionRow | null; uniform: boolean } {
  const [atClick, atPoint, ...atSamples] = regionsContainingEach(db, [[q.lon, q.lat], [q.clicked.lon, q.clicked.lat], ...samples], q.from, q.to);
  const fallback = chooseRegion(atPoint, q.from, q.to);
  const region = chooseRegion(atClick, q.from, q.to) ?? fallback;
  const uniform = atSamples.every((rows) => (chooseRegion(rows, q.from, q.to) ?? fallback)?.id === region?.id);
  return { region, uniform };
}

/** Points spread over a piece, on a grid over its box, kept where they fall inside it. */
function samplePoints(piece: Ring[], n = 4): Position[] {
  const [west, south, east, north] = bboxOf({ type: "Polygon", coordinates: piece });
  const out: Position[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p: Position = [west + ((east - west) * (i + 0.5)) / n, south + ((north - south) * (j + 0.5)) / n];
      if (pointInGeometry(p[0], p[1], { type: "Polygon", coordinates: piece })) out.push(p);
    }
  }
  return out;
}

function regionTest(shapes: AreaGeometry[]): (p: ProvinceEntry) => boolean {
  const boxed = shapes.map((geometry) => ({ geometry, box: bboxOf(geometry) }));
  return (p) => boxed.some(({ geometry, box: [w, s, e, n] }) => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n && pointInGeometry(p.lon, p.lat, geometry));
}

/**
 * The point that picks the clicked piece: the click, or for a click off the coast the province's nearest
 * vertex. Left to itself, a click outside every ring would pick the ring with the nearest vertex, and that
 * can belong to another province when the clicked one has a long straight edge.
 */
function anchorIn(geometry: AreaGeometry, click: Position): { anchor: Position; piece: number } {
  const pieces = polygonsOf(geometry);
  const inside = pieces.findIndex((poly) => pointInGeometry(click[0], click[1], { type: "Polygon", coordinates: poly }));
  if (inside >= 0) return { anchor: click, piece: inside };
  let best = { anchor: click, piece: 0 };
  let bestKm = Infinity;
  pieces.forEach(([outer], piece) => {
    for (const p of outer) {
      const d = distanceKm(click, p);
      if (d < bestKm) {
        bestKm = d;
        best = { anchor: p, piece };
      }
    }
  });
  return best;
}

/** Answers by province piece, region, range and story. A sweep along a coast asks for the same few again and again. */
const CACHE_SIZE = 300;
const cache = new WeakMap<Database.Database, Map<string, Selection>>();

/**
 * `holds`, asked for with `sample`: the piece of the clicked province that would get this same outline wherever
 * it was clicked, or null when the region changes inside it. Sampled, so a sliver of another region can slip by.
 */
export function resolveOutline(
  db: Database.Database,
  q: { lon: number; lat: number; from: number; to: number; clicked: ProvinceRow; story: PublishedStory | null; sample?: boolean },
): { selection: Selection; holds: { id: string; shape: Ring[] } | null } {
  const { lon, lat, clicked, story } = q;
  const geometry = provinceGeometry(db, clicked.id);
  const { anchor, piece } = anchorIn(geometry, [lon, lat]);
  const shape = polygonsOf(geometry)[piece];
  const { region, uniform } =
    yearCount(q.from, q.to) > MAX_SPAN_YEARS && !story ? { region: null, uniform: true } : findRegion(db, q, q.sample ? samplePoints(shape) : []);

  let held = cache.get(db);
  if (!held) cache.set(db, (held = new Map()));
  const key = `${clicked.id} ${piece} ${region?.id ?? "modern"} ${q.from} ${q.to} ${story?.entry.id ?? ""}`;
  let selection = held.get(key);
  if (selection) {
    held.delete(key); // to the back: the least recently used goes first
  } else {
    selection = build(db, { ...q, region, anchor });
    if (held.size >= CACHE_SIZE) held.delete(held.keys().next().value!);
  }
  held.set(key, selection);
  return { selection, holds: q.sample && uniform ? { id: `${clicked.id}/${piece}`, shape } : null };
}

function build(
  db: Database.Database,
  q: { lon: number; from: number; to: number; clicked: ProvinceRow; story: PublishedStory | null; region: RegionRow | null; anchor: Position },
): Selection {
  const { lon, clicked, story, region } = q;
  const centre: Position = [clicked.lon, clicked.lat];
  const belongs = region ? regionTest(regionShapes(db, region)) : (p: ProvinceEntry) => p.country === clicked.country;

  const storyIds = new Set(story?.provinces ?? []);
  const ids = new Set([clicked.id, ...storyIds]);
  let capped = false;
  for (const p of provinceIndex(db)) {
    if (ids.has(p.id)) continue;
    const near = distanceKm(centre, [p.lon, p.lat]) <= CAP_KM;
    if (!near && capped) continue; // already known; no need to test the rest of the far provinces
    if (!belongs(p)) continue;
    if (near) ids.add(p.id);
    else capped = true;
  }

  const provinces = [...ids].map((id) => ({ id, geometry: provinceGeometry(db, id) }));
  const { rings, keptIds, areaKm2, openChains } = buildOutline(provinces, q.anchor, storyIds);

  const bounds = frameBounds(rings, lon);
  const tolerance = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) * SIMPLIFY_FRACTION;
  const simple = rings.map((r) => simplifyRing(r, tolerance));
  return {
    kind: region ? "historical" : "modern",
    name: region ? region.name : clicked.country,
    source: region ? region.source : null,
    areaKm2,
    capped,
    provinceIds: keptIds,
    fill: { type: "MultiPolygon", coordinates: simple.map((r) => [r]) },
    lines: { type: "MultiLineString", coordinates: boundaryLines(simple) },
    bounds,
    openChains,
  };
}
