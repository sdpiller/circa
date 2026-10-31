import { historicalToAstronomical, midYear, yearCount } from "../time/index.ts";

export type RegionRow = {
  id: number;
  source: "cliopatria" | "basemaps";
  name: string;
  from_year: number;
  to_year: number;
  area: number;
};

/** Step 1 of the rule (Task 7 applies it): wider ranges have no single era. */
export const MAX_SPAN_YEARS = 500;

function contains(row: RegionRow, year: number): boolean {
  return row.from_year <= year && year <= row.to_year;
}

function smallest(rows: RegionRow[]): RegionRow | null {
  let best: RegionRow | null = null;
  for (const r of rows) if (!best || r.area < best.area) best = r;
  return best;
}

/** Years inside the range covered by the union of the rows' intervals. */
function heldYears(rows: RegionRow[], from: number, to: number): number {
  const spans = rows
    .map((r) => [Math.max(r.from_year, from), Math.min(r.to_year, to)] as const)
    .filter(([a, b]) => a <= b)
    .map(([a, b]) => [historicalToAstronomical(a), historicalToAstronomical(b)] as const)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of spans) {
    const start = Math.max(a, end + 1);
    if (b >= start) total += b - start + 1;
    end = Math.max(end, b);
  }
  return total;
}

/** Distance in years from `year` to the row's interval; 0 when inside. */
function gap(row: RegionRow, year: number): number {
  return Math.max(row.from_year - year, year - row.to_year, 0);
}

/**
 * Steps 2 to 4 of the region rule (spec 3.6). `rows` overlap the range and contain the click.
 * 2: the Cliopatria name that held the spot for at least half of the range.
 * 3: a historical-basemaps row covering the middle year.
 * 4: the smallest Cliopatria row covering the middle year.
 */
export function chooseRegion(rows: RegionRow[], from: number, to: number): RegionRow | null {
  const y = midYear(from, to);
  const clio = rows.filter((r) => r.source === "cliopatria");

  const byName = new Map<string, RegionRow[]>();
  for (const r of clio) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);

  const total = yearCount(from, to);
  let topName: string | null = null;
  let topHeld = 0;
  for (const [name, group] of byName) {
    const held = heldYears(group, from, to);
    if (held > topHeld) {
      topHeld = held;
      topName = name;
    }
  }
  if (topName !== null && topHeld * 2 >= total) {
    return byName.get(topName)!.reduce((best, r) => (gap(r, y) < gap(best, y) ? r : best));
  }

  const atlas = smallest(rows.filter((r) => r.source === "basemaps" && contains(r, y)));
  if (atlas) return atlas;

  return smallest(clio.filter((r) => contains(r, y)));
}
