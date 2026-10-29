/**
 * Timing of GET /api/events queries against the real database, per zoom band.
 * Viewports are centred on real event locations (where people will look) with sizes typical
 * of each band; year ranges are random, from a single year to the whole window. Seeded, so
 * runs are comparable. Usage: npm run bench:events
 */
import Database from "better-sqlite3";
import { queryEvents, ZOOM_BANDS, type EventsQueryInput } from "../lib/db/events.ts";
import { DB_PATH } from "../lib/db/schema.ts";
import { MAX_YEAR, MIN_YEAR } from "../lib/time/index.ts";

const SAMPLES = 300;
// Longitude span of a typical viewport in each band, keyed by the band's minZoom.
const VIEWS: Record<number, { name: string; degrees: number }> = {
  0: { name: "globe", degrees: 360 },
  3: { name: "continent", degrees: 50 },
  5: { name: "country", degrees: 12 },
  8: { name: "city", degrees: 0.6 },
};

// mulberry32: small seeded PRNG so runs are repeatable.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomYear(r: () => number): number {
  const y = Math.round(MIN_YEAR + r() * (MAX_YEAR - MIN_YEAR));
  return y === 0 ? 1 : y;
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
const centres = db.prepare("SELECT lat, lon FROM events ORDER BY random() LIMIT 5000").all() as { lat: number; lon: number }[];
const r = rng(42);

console.log(`${SAMPLES} random viewports per band, all five kinds per request\n`);
console.log("band      zoom  dots   p50 ms   p95 ms   max ms   slowest case");
for (const band of ZOOM_BANDS) {
  const { name, degrees: span } = VIEWS[band.minZoom];
  const times: { ms: number; q: EventsQueryInput }[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const c = centres[Math.floor(r() * centres.length)];
    const [a, b] = [randomYear(r), randomYear(r)];
    const range = r() < 0.2 ? { from: MIN_YEAR, to: MAX_YEAR } : { from: Math.min(a, b), to: Math.max(a, b) };
    const half = span / 2;
    const q: EventsQueryInput = span >= 360
      ? { west: -180, east: 180, south: -90, north: 90, zoom: band.minZoom, ...range }
      : { west: c.lon - half, east: c.lon + half, south: Math.max(-90, c.lat - half / 2), north: Math.min(90, c.lat + half / 2), zoom: band.minZoom, ...range };
    queryEvents(db, q); // warm the page cache for this viewport, as a repeat visit would
    const t0 = performance.now();
    queryEvents(db, q);
    times.push({ ms: performance.now() - t0, q });
  }
  times.sort((x, y) => x.ms - y.ms);
  const pct = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))].ms.toFixed(1).padStart(8);
  const worst = times.at(-1)!;
  const w = worst.q;
  console.log(`${name.padEnd(9)} ${String(band.minZoom).padEnd(5)} ${String(band.total).padEnd(4)} ${pct(0.5)} ${pct(0.95)} ${worst.ms.toFixed(1).padStart(8)}   lon ${w.west.toFixed(1)}..${w.east.toFixed(1)} lat ${w.south.toFixed(1)}..${w.north.toFixed(1)} years ${w.from}..${w.to}`);
}

// Nothing matches, so every kind's walk runs to the end. The worst case of a sitelinks-ordered walk.
const empty: EventsQueryInput = { west: -140, east: -139, south: -30, north: -29, from: MIN_YEAR, to: MAX_YEAR, zoom: 8 };
queryEvents(db, empty);
const t0 = performance.now();
const found = queryEvents(db, empty).events.length;
console.log(`\nempty South Pacific box, whole range: ${(performance.now() - t0).toFixed(1)} ms (${found} dots)`);
db.close();
