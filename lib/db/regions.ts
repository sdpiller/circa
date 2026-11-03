/** Historical region lookups for the area API. */
import type Database from "better-sqlite3";
import { pointInGeometry, type AreaGeometry, type Position } from "../geo/geometry.ts";
import type { RegionRow } from "../outline/choose.ts";

type Statements = { containing: Database.Statement; polity: Database.Statement; atlas: Database.Statement; many: Database.Statement };
const statements = new WeakMap<Database.Database, Statements>();

/**
 * Parsed shapes of the rows read most recently. Reading and parsing the text is the cost of a click (about
 * 50 ms for the United States in the 1800s, 117 rows and 3 MB), and the hover asks about the same rows again
 * and again. The largest shape is 79 KB of text, so this holds a few tens of MB at worst.
 */
const PARSED_MAX = 400;
const parsed = new WeakMap<Database.Database, Map<number, AreaGeometry>>();

/** The shapes of these rows, reading the ones not held in one query. */
function shapesOf(db: Database.Database, ids: number[]): Map<number, AreaGeometry> {
  let held = parsed.get(db);
  if (!held) parsed.set(db, (held = new Map()));
  const out = new Map<number, AreaGeometry>();
  const missing: number[] = [];
  for (const id of ids) {
    const g = held.get(id);
    if (!g) {
      missing.push(id);
      continue;
    }
    held.delete(id); // to the back: the least recently used goes first
    held.set(id, g);
    out.set(id, g);
  }
  if (missing.length > 0) {
    for (const { id, geojson } of statementsFor(db).many.all(JSON.stringify(missing)) as { id: number; geojson: string }[]) {
      const g = JSON.parse(geojson) as AreaGeometry;
      if (held.size >= PARSED_MAX) held.delete(held.keys().next().value!);
      held.set(id, g);
      out.set(id, g);
    }
  }
  return out;
}

function statementsFor(db: Database.Database): Statements {
  let s = statements.get(db);
  if (!s) {
    s = {
      containing: db.prepare(`SELECT id, source, name, from_year, to_year, area, west, south, east, north FROM regions
        WHERE from_year <= @to AND to_year >= @from AND west <= @east AND east >= @west AND south <= @north AND north >= @south`),
      polity: db.prepare("SELECT geojson FROM regions WHERE id = ?"),
      many: db.prepare("SELECT id, geojson FROM regions WHERE id IN (SELECT value FROM json_each(?))"),
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

/** The same for each of several nearby points, in one pass. Only rows whose box holds a point are read in full. */
export function regionsContainingEach(db: Database.Database, points: Position[], from: number, to: number): RegionRow[][] {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const box = { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
  type Boxed = RegionRow & { west: number; south: number; east: number; north: number };
  const rows = statementsFor(db).containing.all({ ...box, from, to }) as Boxed[];
  const inBox = (r: Boxed, [lon, lat]: Position) => lon >= r.west && lon <= r.east && lat >= r.south && lat <= r.north;
  const wanted = rows.filter((r) => points.some((p) => inBox(r, p)));
  const shapes = shapesOf(db, wanted.map((r) => r.id));
  const found: RegionRow[][] = points.map(() => []);
  for (const r of wanted) {
    const row: RegionRow = { id: r.id, source: r.source, name: r.name, from_year: r.from_year, to_year: r.to_year, area: r.area };
    const geometry = shapes.get(r.id)!;
    points.forEach((p, i) => {
      if (inBox(r, p) && pointInGeometry(p[0], p[1], geometry)) found[i].push(row);
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
