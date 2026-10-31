/** Province lookups for the area API. Geometry stays in SQLite until a click needs it. */
import type Database from "better-sqlite3";
import type { AreaGeometry } from "../geo/geometry.ts";
import { nearBox, nearestProvince, type ProvinceRow } from "../geo/provinces.ts";

export type ProvinceEntry = Omit<ProvinceRow, "geojson">;

type Held = { index: ProvinceEntry[]; row: Database.Statement; geojson: Database.Statement };
const held = new WeakMap<Database.Database, Held>();

function holderFor(db: Database.Database): Held {
  let h = held.get(db);
  if (!h) {
    h = {
      index: db.prepare("SELECT id, name, country, lon, lat, west, south, east, north, area FROM provinces").all() as ProvinceEntry[],
      row: db.prepare("SELECT * FROM provinces WHERE id = ?"),
      geojson: db.prepare("SELECT geojson FROM provinces WHERE id = ?"),
    };
    held.set(db, h);
  }
  return h;
}

/** Every province without its geometry, read once per database. */
export function provinceIndex(db: Database.Database): ProvinceEntry[] {
  return holderFor(db).index;
}

/** The province holding the point, or the nearest within maxKm, or null. */
export function provinceAt(db: Database.Database, lon: number, lat: number, maxKm = 50): ProvinceRow | null {
  const h = holderFor(db);
  const candidates = h.index.filter((p) => nearBox(p, lon, lat, maxKm)).map((p) => h.row.get(p.id) as ProvinceRow);
  return nearestProvince(candidates, lon, lat, maxKm);
}

export function provinceGeometry(db: Database.Database, id: string): AreaGeometry {
  const row = holderFor(db).geojson.get(id) as { geojson: string } | undefined;
  if (!row) throw new Error(`No province ${id}`);
  return JSON.parse(row.geojson) as AreaGeometry;
}
