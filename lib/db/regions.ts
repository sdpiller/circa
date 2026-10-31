/** Historical region lookups for the area API. */
import type Database from "better-sqlite3";
import { pointInGeometry, type AreaGeometry, type Position } from "../geo/geometry.ts";
import type { RegionRow } from "../outline/choose.ts";

type Statements = { containing: Database.Statement; polity: Database.Statement; atlas: Database.Statement };
const statements = new WeakMap<Database.Database, Statements>();

function statementsFor(db: Database.Database): Statements {
  let s = statements.get(db);
  if (!s) {
    s = {
      containing: db.prepare(`SELECT id, source, name, from_year, to_year, area, geojson FROM regions
        WHERE from_year <= @to AND to_year >= @from AND west <= @east AND east >= @west AND south <= @north AND north >= @south`),
      polity: db.prepare("SELECT geojson FROM regions WHERE id = ?"),
      atlas: db.prepare("SELECT geojson FROM regions WHERE source = 'basemaps' AND name = ? AND from_year = ? AND to_year = ?"),
    };
    statements.set(db, s);
  }
  return s;
}

/** The regions that overlap the range and contain the point. */
export function regionsContaining(db: Database.Database, lon: number, lat: number, from: number, to: number): RegionRow[] {
  return regionsContainingEach(db, [[lon, lat]], from, to)[0];
}

/**
 * The same for each of several nearby points, in one pass. Parsing is the cost of a click, and a geometry
 * held for a second look survives garbage collection, so each row is parsed once and let go.
 */
export function regionsContainingEach(db: Database.Database, points: Position[], from: number, to: number): RegionRow[][] {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const box = { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
  const rows = statementsFor(db).containing.all({ ...box, from, to }) as (RegionRow & { geojson: string })[];
  const found: RegionRow[][] = points.map(() => []);
  for (const { geojson, ...row } of rows) {
    const geometry = JSON.parse(geojson) as AreaGeometry;
    points.forEach(([lon, lat], i) => {
      if (pointInGeometry(lon, lat, geometry)) found[i].push(row);
    });
  }
  return found;
}

/** The shapes of a chosen region: that row for Cliopatria, every piece of its name and snapshot for the atlas. */
export function regionShapes(db: Database.Database, row: RegionRow): AreaGeometry[] {
  const s = statementsFor(db);
  const rows = (row.source === "cliopatria" ? s.polity.all(row.id) : s.atlas.all(row.name, row.from_year, row.to_year)) as { geojson: string }[];
  return rows.map((r) => JSON.parse(r.geojson) as AreaGeometry);
}
