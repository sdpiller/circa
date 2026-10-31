/** Historical region lookups for the area API. */
import type Database from "better-sqlite3";
import { pointInGeometry, type AreaGeometry } from "../geo/geometry.ts";
import type { RegionRow } from "../outline/choose.ts";

type Statements = { containing: Database.Statement; polity: Database.Statement; atlas: Database.Statement };
const statements = new WeakMap<Database.Database, Statements>();

function statementsFor(db: Database.Database): Statements {
  let s = statements.get(db);
  if (!s) {
    s = {
      containing: db.prepare(`SELECT id, source, name, from_year, to_year, area, geojson FROM regions
        WHERE from_year <= @to AND to_year >= @from AND west <= @lon AND east >= @lon AND south <= @lat AND north >= @lat`),
      polity: db.prepare("SELECT geojson FROM regions WHERE id = ?"),
      atlas: db.prepare("SELECT geojson FROM regions WHERE source = 'basemaps' AND name = ? AND from_year = ? AND to_year = ?"),
    };
    statements.set(db, s);
  }
  return s;
}

/**
 * The regions that overlap the range and contain the point. Parsing is the cost here, so a caller that
 * asks about two nearby points can pass the same `parsed` map to both.
 */
export function regionsContaining(db: Database.Database, lon: number, lat: number, from: number, to: number, parsed = new Map<number, AreaGeometry>()): RegionRow[] {
  const rows = statementsFor(db).containing.all({ lon, lat, from, to }) as (RegionRow & { geojson: string })[];
  const geometry = (r: RegionRow & { geojson: string }) => {
    let g = parsed.get(r.id);
    if (!g) parsed.set(r.id, (g = JSON.parse(r.geojson) as AreaGeometry));
    return g;
  };
  return rows
    .filter((r) => pointInGeometry(lon, lat, geometry(r)))
    .map(({ id, source, name, from_year, to_year, area }) => ({ id, source, name, from_year, to_year, area }));
}

/** The shapes of a chosen region: that row for Cliopatria, every piece of its name and snapshot for the atlas. */
export function regionShapes(db: Database.Database, row: RegionRow): AreaGeometry[] {
  const s = statementsFor(db);
  const rows = (row.source === "cliopatria" ? s.polity.all(row.id) : s.atlas.all(row.name, row.from_year, row.to_year)) as { geojson: string }[];
  return rows.map((r) => JSON.parse(r.geojson) as AreaGeometry);
}
