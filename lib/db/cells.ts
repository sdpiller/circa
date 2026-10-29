/**
 * Per-cell counts of items in a viewport and year range, for the grid shading (GET /api/cells).
 * "Events" are kinds event and discovery; everything else is people and places.
 */
import type Database from "better-sqlite3";
import { resolutionForZoom, type Res } from "../cells.ts";
import { EventsQuery, lonRanges, type EventsQueryInput } from "./events.ts";

/** Same fields and rules as the dots query. */
export const CellsQuery = EventsQuery;
export type CellsQueryInput = EventsQueryInput;

export type GridCell = { cell: string; items: number; events: number };
export type CellsResult = { res: Res | null; cells: GridCell[] };

// INDEXED BY is deliberate (decisions.md entry 25 did the same for dots). Left to choose, SQLite walks
// the whole h3_rN index to skip a sort (about 490 ms). Forcing the covering index idx_events_cells_rN reads only the viewport.
// The column name is built from a Res (2 to 5, from resolutionForZoom), never from input.
const statements = new WeakMap<Database.Database, Map<Res, Database.Statement>>();
function statementFor(db: Database.Database, res: Res): Database.Statement {
  let perDb = statements.get(db);
  if (!perDb) statements.set(db, (perDb = new Map()));
  let stmt = perDb.get(res);
  if (!stmt) {
    const col = `h3_r${res}`;
    stmt = db.prepare(`
      SELECT ${col} AS cell, COUNT(*) AS items, SUM(kind IN ('event', 'discovery')) AS events
      FROM events INDEXED BY idx_events_cells_r${res}
      WHERE start_year <= @to AND end_year >= @from
        AND lat BETWEEN @south AND @north
        AND (lon BETWEEN @w1 AND @e1 OR lon BETWEEN @w2 AND @e2)
      GROUP BY ${col}`);
    perDb.set(res, stmt);
  }
  return stmt;
}

export function queryCells(db: Database.Database, q: CellsQueryInput): CellsResult {
  const res = resolutionForZoom(q.zoom);
  if (res === null) return { res: null, cells: [] };
  const ranges = lonRanges(q.west, q.east);
  const [[w1, e1], [w2, e2]] = [ranges[0], ranges[1] ?? ranges[0]];
  const cells = statementFor(db, res).all({ from: q.from, to: q.to, south: q.south, north: q.north, w1, e1, w2, e2 }) as GridCell[];
  return { res, cells };
}
