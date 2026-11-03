/**
 * Parsers for the three boundary datasets (Natural Earth provinces, Cliopatria, historical-basemaps)
 * and the small pure helpers the loader needs. Everything here is pure: no file or network access.
 * External data is validated with zod; the raw files are data only and are never executed.
 */
import { inflateRawSync } from "node:zlib";
import { z } from "zod";
import { bboxOf, polygonsOf, ringAreaKm2, type AreaGeometry, type Position, type Ring } from "../lib/geo/geometry.ts";
import { simplifyRing } from "../lib/geo/outline.ts";
import type { ProvinceRow } from "../lib/geo/provinces.ts";
import type { RegionRow } from "../lib/outline/choose.ts";
import { astronomicalToHistorical, formatRange, historicalToAstronomical, MAX_YEAR, MIN_YEAR } from "../lib/time/index.ts";

const Pos = z.tuple([z.number(), z.number()]).rest(z.number()).transform((p): Position => [p[0], p[1]]);
const RingSchema = z.array(Pos).min(4);
const Geometry = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: z.array(RingSchema).min(1) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(RingSchema).min(1)).min(1) }),
]);

/** Area of a polygon geometry in km2: outer rings minus holes. */
export function geometryAreaKm2(g: AreaGeometry): number {
  let total = 0;
  for (const [outer, ...holes] of polygonsOf(g)) {
    total += ringAreaKm2(outer);
    for (const h of holes) total -= ringAreaKm2(h);
  }
  return Math.max(0, total);
}

// ---------- provinces ----------

const ProvinceFeature = z.object({
  properties: z.object({
    adm1_code: z.string().min(1),
    name: z.string().min(1).nullable(), // 7 of 4,596 are unnamed; they take their country's name
    admin: z.string().min(1),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  geometry: Geometry,
});
const FeatureCollection = z.object({ features: z.array(z.unknown()) });

export function parseProvinces(fc: unknown): ProvinceRow[] {
  const features = FeatureCollection.parse(fc).features;
  const seen = new Set<string>();
  return features.map((f, i) => {
    const { properties: p, geometry } = ProvinceFeature.parse(f);
    if (seen.has(p.adm1_code)) throw new Error(`Duplicate adm1_code ${p.adm1_code} at feature ${i}`);
    seen.add(p.adm1_code);
    const [west, south, east, north] = bboxOf(geometry);
    return { id: p.adm1_code, name: p.name ?? p.admin, country: p.admin, lon: p.longitude, lat: p.latitude, west, south, east, north, area: geometryAreaKm2(geometry), geojson: JSON.stringify(geometry) };
  });
}

// ---------- regions ----------

export type NewRegion = Omit<RegionRow, "id"> & {
  wikidata: string | null;
  west: number;
  south: number;
  east: number;
  north: number;
  geojson: string;
};

/**
 * Regions are only used for containment, and parsing them is the largest cost of a click, so they are
 * stored simplified and with few decimals. Cliopatria's coordinates carry 15 digits; short numbers parse
 * about three times faster. Three decimals is about 100 m, finer than the tolerance.
 */
const REGION_TOLERANCE_DEG = 0.02;

function simplified(g: AreaGeometry): AreaGeometry {
  const short = (x: number) => Math.round(x * 1000) / 1000;
  const polygon = (rings: Ring[]) => rings.map((ring) => simplifyRing(ring, REGION_TOLERANCE_DEG).map((p): Position => [short(p[0]), short(p[1])]));
  return g.type === "Polygon" ? { type: "Polygon", coordinates: polygon(g.coordinates) } : { type: "MultiPolygon", coordinates: g.coordinates.map(polygon) };
}

function regionBase(geometry: AreaGeometry) {
  const stored = simplified(geometry);
  const [west, south, east, north] = bboxOf(stored);
  return { west, south, east, north, geojson: JSON.stringify(stored) };
}

const CliopatriaFeature = z.object({
  properties: z.object({
    Name: z.string().nullable(),
    FromYear: z.number().int(),
    ToYear: z.number().int(),
    Area: z.number().nullable(),
    Type: z.string().nullable(),
    Wikidata: z.string().nullish(),
  }),
  geometry: Geometry,
});

/**
 * Cliopatria rows usable for picking a region. RELATION rows and names in parentheses are not
 * states (they are links between polities and placeholders), so they are dropped. Its years are
 * historical (negative is BCE) except that 0 appears; a start of 0 means 1 CE and an end of 0
 * means 1 BCE.
 */
export function parseCliopatria(fc: unknown): NewRegion[] {
  const out: NewRegion[] = [];
  for (const f of FeatureCollection.parse(fc).features) {
    const { properties: p, geometry } = CliopatriaFeature.parse(f);
    const name = p.Name?.trim() ?? "";
    if (p.Type === "RELATION" || name === "" || name.startsWith("(")) continue;
    const from = p.FromYear === 0 ? 1 : p.FromYear;
    const to = p.ToYear === 0 ? -1 : p.ToYear;
    if (from > to) continue;
    const wikidata = p.Wikidata && /^Q\d+$/.test(p.Wikidata) ? p.Wikidata : null;
    out.push({ source: "cliopatria", name, from_year: from, to_year: to, area: p.Area ?? geometryAreaKm2(geometry), wikidata, ...regionBase(geometry) });
  }
  return out;
}

const BasemapsFeature = z.object({
  properties: z.object({ NAME: z.string().nullish() }),
  geometry: Geometry,
});

/**
 * Names a source file mangled, and what the other snapshots call them. world_1878.geojson has "M?ori", while
 * 1783, 1800, 1880 and 1900 have "Māori". The owner chose to correct it (2026-11-03). Never a change of name.
 */
const NAME_FIXES: Readonly<Record<string, string>> = { "M?ori": "Māori" };

/** One historical-basemaps snapshot, as rows valid for the given year range. Unnamed features are dropped. */
export function parseBasemaps(fc: unknown, snapshot: { from: number; to: number }): NewRegion[] {
  const out: NewRegion[] = [];
  for (const f of FeatureCollection.parse(fc).features) {
    const { properties: p, geometry } = BasemapsFeature.parse(f);
    const raw = p.NAME?.trim() ?? "";
    const name = NAME_FIXES[raw] ?? raw;
    if (name === "") continue;
    out.push({ source: "basemaps", name, from_year: snapshot.from, to_year: snapshot.to, area: geometryAreaKm2(geometry), wikidata: null, ...regionBase(geometry) });
  }
  return out;
}

/** Drops basemaps rows whose name the owner struck in the review. Cliopatria rows are never struck. */
export function applyStrikes(rows: NewRegion[], struck: ReadonlySet<string>): NewRegion[] {
  return rows.filter((r) => !(r.source === "basemaps" && struck.has(r.name)));
}

/**
 * The year range each snapshot answers for: the years closest to it. Midpoints are computed in
 * astronomical numbering (which has a year 0), so no range ever contains year 0. A tie goes to the
 * earlier snapshot. The first range starts at MIN_YEAR and the last ends at MAX_YEAR; snapshots
 * older than MIN_YEAR are dropped.
 */
export function snapshotRanges(years: number[]): { year: number; from: number; to: number }[] {
  const ys = [...new Set(years)].filter((y) => y >= MIN_YEAR && y <= MAX_YEAR).sort((a, b) => a - b);
  return ys.map((year, i) => {
    const from = i === 0 ? MIN_YEAR : astronomicalToHistorical(Math.floor((historicalToAstronomical(ys[i - 1]) + historicalToAstronomical(year)) / 2) + 1);
    const to = i === ys.length - 1 ? MAX_YEAR : astronomicalToHistorical(Math.floor((historicalToAstronomical(year) + historicalToAstronomical(ys[i + 1])) / 2));
    return { year, from, to };
  });
}

// ---------- zip ----------

/**
 * The bytes of the first entry whose name ends with `suffix`, read through the central directory.
 * Supports stored and deflated entries, which is all Cliopatria's zip uses.
 */
export function unzipEntry(zip: Buffer, suffix: string): Buffer {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file: no end-of-central-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt zip central directory");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localAt = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (name.endsWith(suffix)) {
      const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
      const comp = zip.subarray(dataAt, dataAt + compSize);
      if (method === 0) return Buffer.from(comp);
      if (method === 8) return inflateRawSync(comp);
      throw new Error(`Unsupported zip compression method ${method} for ${name}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`No zip entry ends with ${suffix}`);
}

// ---------- the names document ----------

/**
 * Markdown for the owner's review of the historical-atlas names, the only ones etl/struck-names.json
 * can remove. Cliopatria rows are ignored. Larger total area first; struck names are marked.
 */
export function regionNamesDoc(rows: NewRegion[], struck: ReadonlySet<string>): string {
  const byName = new Map<string, { from: number; to: number; rows: number; area: number }>();
  for (const r of rows) {
    if (r.source !== "basemaps") continue;
    const g = byName.get(r.name) ?? { from: r.from_year, to: r.to_year, rows: 0, area: 0 };
    g.from = Math.min(g.from, r.from_year);
    g.to = Math.max(g.to, r.to_year);
    g.rows++;
    g.area += r.area;
    byName.set(r.name, g);
  }
  const lines = [
    "# Region names",
    "",
    "Generated by npm run etl:load from every historical-atlas region row, before strikes. Do not edit by hand.",
    "To strike a name, add it to etl/struck-names.json and run npm run etl:load again.",
    "Each line shows the name, the years it appears in, the number of rows, and the total area.",
    "",
    `${byName.size.toLocaleString("en-US")} distinct names.`,
    "",
  ];
  for (const [name, g] of [...byName].sort((a, b) => b[1].area - a[1].area || a[0].localeCompare(b[0]))) {
    lines.push(`- ${name}: ${formatRange(g.from, g.to)}, ${g.rows} rows, ${Math.round(g.area).toLocaleString("en-US")} km2${struck.has(name) ? " STRUCK" : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}
