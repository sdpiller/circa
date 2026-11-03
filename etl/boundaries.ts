/**
 * Boundary fetch stage: three open datasets into data/raw/boundaries/<source>/.
 * Each source is pinned to a commit, so a rebuild reads the same bytes. Files already on disk are
 * skipped, requests are spaced out, and every file is written to a temp name and then renamed.
 * The files are data only: they are parsed (etl/boundaries-parse.ts), never executed.
 *
 * Usage: npm run etl:boundaries
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MIN_YEAR } from "../lib/time/index.ts";
import { RAW_DIR } from "./fetch.ts";

/** Commits resolved with git ls-remote on 2026-10-30. */
export const PINS = {
  naturalearth: { repo: "nvkelso/natural-earth-vector", commit: "ca96624a56bd078437bca8184e78163e5039ad19" },
  cliopatria: { repo: "Seshat-Global-History-Databank/cliopatria", commit: "5f433377139a6eeaeacbdc894b70f8805b72c8b5" },
  basemaps: { repo: "aourednik/historical-basemaps", commit: "da7a4b735ecef70aebdc9c73e409d8a2500d50f3" },
} as const;

export const BOUNDARIES_DIR = join(RAW_DIR, "boundaries");
export const NATURALEARTH_FILE = join(BOUNDARIES_DIR, "naturalearth", "ne_10m_admin_1_states_provinces.geojson");
export const CLIOPATRIA_FILE = join(BOUNDARIES_DIR, "cliopatria", "cliopatria.geojson.zip");
export const BASEMAPS_DIR = join(BOUNDARIES_DIR, "basemaps");

/** The world_*.geojson files at the pinned commit (the listing was read once from the GitHub API). */
const BASEMAPS_NAMES = ("100 1000 1100 1200 1279 1300 1400 1492 1500 1530 1600 1650 1700 1715 1783 1800 1815 1878 1880 1900 1914 1920 1930 1938 1945 1960 1994 200 2000 2010 300 400 500 600 700 800 900 " +
  "bc1 bc100 bc1000 bc10000 bc123000 bc1500 bc200 bc2000 bc300 bc3000 bc323 bc400 bc4000 bc500 bc5000 bc700 bc8000").split(" ");

/** The snapshot year in historical numbering: "bc323" is -323, "1492" is 1492. */
export const snapshotYearOfName = (name: string) => (name.startsWith("bc") ? -Number(name.slice(2)) : Number(name));

/** Snapshots inside the app's range, oldest first, with their raw file path. */
export function basemapSnapshots(): { year: number; file: string }[] {
  return BASEMAPS_NAMES.map((n) => ({ year: snapshotYearOfName(n), file: join(BASEMAPS_DIR, `world_${n}.geojson`) }))
    .filter((s) => s.year >= MIN_YEAR)
    .sort((a, b) => a.year - b.year);
}

const rawUrl = (p: { repo: string; commit: string }, path: string) => `https://raw.githubusercontent.com/${p.repo}/${p.commit}/${path}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GAP_MS = 1500;

async function download(url: string, dest: string): Promise<boolean> {
  if (existsSync(dest)) return false;
  mkdirSync(join(dest, ".."), { recursive: true });
  const contact = process.env.WIKIMEDIA_CONTACT ?? "no contact set";
  const res = await fetch(url, { headers: { "User-Agent": `Circa/0.1 (${contact}) node/${process.version}` } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(`${dest}.tmp`, Buffer.from(await res.arrayBuffer()));
  renameSync(`${dest}.tmp`, dest);
  console.log(`  fetched ${dest}`);
  await sleep(GAP_MS);
  return true;
}

async function main() {
  await download(rawUrl(PINS.naturalearth, "geojson/ne_10m_admin_1_states_provinces.geojson"), NATURALEARTH_FILE);
  await download(rawUrl(PINS.cliopatria, "cliopatria.geojson.zip"), CLIOPATRIA_FILE);
  for (const s of basemapSnapshots()) {
    await download(rawUrl(PINS.basemaps, `geojson/${s.file.slice(s.file.lastIndexOf("world_"))}`), s.file);
  }
  console.log("Boundaries are on disk.");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
