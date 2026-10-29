/**
 * Timing of the grid queries against the real database, per zoom band.
 * Viewports are centred on real event locations and sized as MapLibre shows them in a
 * 1440x900 window (512 px tiles: 360 * 1440 / (512 * 2^zoom) degrees of longitude across).
 * Seeded, so runs are comparable. Usage: npm run bench:cells
 */
import Database from "better-sqlite3";
import { queryCells, type CellsQueryInput } from "../lib/db/cells.ts";
import { DB_PATH } from "../lib/db/schema.ts";
import { MAX_YEAR, MIN_YEAR } from "../lib/time/index.ts";

const SAMPLES = 300;
const WIDTH = 1440;
const HEIGHT = 900;
const ZOOMS = [3, 4.3, 5.6, 7];

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

type Sample = { ms: number; q: CellsQueryInput; n: number };

function report(label: string, zoom: number, samples: Sample[]) {
  samples.sort((x, y) => x.ms - y.ms);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))].ms.toFixed(1).padStart(8);
  const worst = samples.at(-1)!;
  const w = worst.q;
  console.log(`${label.padEnd(8)} ${String(zoom).padEnd(5)} ${pct(0.5)} ${pct(0.95)} ${worst.ms.toFixed(1).padStart(8)}   ${worst.n} rows, lon ${w.west.toFixed(1)}..${w.east.toFixed(1)} lat ${w.south.toFixed(1)}..${w.north.toFixed(1)} years ${w.from}..${w.to}`);
}

const cellSamples = new Map<number, Sample[]>();
for (const zoom of ZOOMS) {
  const lonSpan = (360 * WIDTH) / (512 * 2 ** zoom);
  const latSpan = lonSpan * (HEIGHT / WIDTH);
  const samples: Sample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const c = centres[Math.floor(r() * centres.length)];
    const [a, b] = [randomYear(r), randomYear(r)];
    const range = r() < 0.2 ? { from: MIN_YEAR, to: MAX_YEAR } : { from: Math.min(a, b), to: Math.max(a, b) };
    const q: CellsQueryInput = {
      west: c.lon - lonSpan / 2, east: c.lon + lonSpan / 2,
      south: Math.max(-90, c.lat - latSpan / 2), north: Math.min(90, c.lat + latSpan / 2),
      zoom, ...range,
    };
    queryCells(db, q); // warm the page cache for this viewport, as a repeat visit would
    const t0 = performance.now();
    const { cells } = queryCells(db, q);
    samples.push({ ms: performance.now() - t0, q, n: cells.length });
  }
  cellSamples.set(zoom, samples);
}

console.log(`${SAMPLES} random viewports per band, 1440x900 window\n`);
console.log("queryCells        zoom   p50 ms   p95 ms   max ms   slowest case (cells returned)");
for (const zoom of ZOOMS) report("cells", zoom, cellSamples.get(zoom)!);
// Task 4 adds a queryArea section here, timing one random returned cell per viewport.
db.close();
