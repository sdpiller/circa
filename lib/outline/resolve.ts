/**
 * From a click and a range to an outline (spec 3.6): choose a region, gather the modern provinces that
 * fall in it within the cap, and merge them. Simplifying happens here, after the merge, never before.
 */
import type Database from "better-sqlite3";
import { provinceGeometry, provinceIndex, type ProvinceEntry } from "../db/provinces.ts";
import { regionsContainingEach, regionShapes } from "../db/regions.ts";
import { bboxOf, distanceKm, pointInGeometry, polygonsOf, type AreaGeometry, type Position, type Ring } from "../geo/geometry.ts";
import { boundaryLines, buildOutline, frameBounds, simplifyRing } from "../geo/outline.ts";
import type { ProvinceRow } from "../geo/provinces.ts";
import type { PublishedStory } from "../narrative/publish.ts";
import { yearCount } from "../time/index.ts";
import { chooseRegion, MAX_SPAN_YEARS, type RegionRow } from "./choose.ts";

/** Provinces farther than this from the click are left out, unless clicked or a story's own. */
export const CAP_KM = 800;

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

/** Steps 2 to 4 of the rule at the click, then once more at the clicked province's representative point, because old shapes miss coasts. */
function findRegion(db: Database.Database, q: { lon: number; lat: number; from: number; to: number; clicked: ProvinceRow }): RegionRow | null {
  const [atClick, atPoint] = regionsContainingEach(db, [[q.lon, q.lat], [q.clicked.lon, q.clicked.lat]], q.from, q.to);
  return chooseRegion(atClick, q.from, q.to) ?? chooseRegion(atPoint, q.from, q.to);
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
function anchorIn(geometry: AreaGeometry, click: Position): Position {
  if (pointInGeometry(click[0], click[1], geometry)) return click;
  let best = click;
  let bestKm = Infinity;
  for (const [outer] of polygonsOf(geometry)) {
    for (const p of outer) {
      const d = distanceKm(click, p);
      if (d < bestKm) {
        bestKm = d;
        best = p;
      }
    }
  }
  return best;
}

export function resolveOutline(
  db: Database.Database,
  q: { lon: number; lat: number; from: number; to: number; clicked: ProvinceRow; story: PublishedStory | null },
): Selection {
  const { lon, lat, clicked, story } = q;
  const click: Position = [lon, lat];
  const region = yearCount(q.from, q.to) > MAX_SPAN_YEARS && !story ? null : findRegion(db, q);
  const belongs = region ? regionTest(regionShapes(db, region)) : (p: ProvinceEntry) => p.country === clicked.country;

  const storyIds = new Set(story?.provinces ?? []);
  const ids = new Set([clicked.id, ...storyIds]);
  let capped = false;
  for (const p of provinceIndex(db)) {
    if (ids.has(p.id)) continue;
    const near = distanceKm(click, [p.lon, p.lat]) <= CAP_KM;
    if (!near && capped) continue; // already known; no need to test the rest of the far provinces
    if (!belongs(p)) continue;
    if (near) ids.add(p.id);
    else capped = true;
  }

  const provinces = [...ids].map((id) => ({ id, geometry: provinceGeometry(db, id) }));
  const anchor = anchorIn(provinces[0].geometry, click);
  const { rings, keptIds, areaKm2, openChains } = buildOutline(provinces, anchor, storyIds);

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
