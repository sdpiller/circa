/**
 * Phase 0 data audit. Reads data/raw/ (written by etl/fetch.ts), normalizes every item with the
 * same code Phase 1 will use, and writes tables between the GENERATED markers in docs/data-audit.md.
 * Hand-written findings outside the markers are preserved.
 *
 * Usage: npm run audit
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatYear } from "../lib/time/index.ts";
import { loadConfig, RAW_DIR, type RawFile } from "./fetch.ts";
import { collectFacts, normalize, type EventRecord, type Rejection } from "./normalize.ts";
import type { ClassConfig } from "./queries.ts";

const REPORT = join(import.meta.dirname, "..", "docs", "data-audit.md");
const BEGIN = "<!-- BEGIN GENERATED (npm run audit) -->";
const END = "<!-- END GENERATED -->";
const MIN_YEAR = -3500;
const MAX_YEAR = 2026;

// ---------- regions ----------

/** Coarse, ordered, first match wins. Boundaries are approximate by design. */
export function region(lat: number, lon: number): string {
  if (lon < -25 && lon > -170) return lat >= 15 ? "Americas north of 15°N" : "Americas south of 15°N";
  const mediterraneanIsland = lat > 34.5 && lon > 12; // Sicily, Malta, Crete, Cyprus, Rhodes
  const southernSpain = lat > 35.95 && lon < -1.5;
  if (lat >= 19 && lat <= 37.3 && lon >= -18 && lon <= 34.2 && !mediterraneanIsland && !southernSpain) return "North Africa";
  if (lat >= 34.5 && lon >= -25 && lon <= 45 && !(lat < 42 && lon > 26)) return "Europe";
  if (lat >= 12 && lat <= 43 && lon >= 26 && lon <= 63) return "Anatolia and Middle East";
  if (lat >= 5 && lat <= 37 && lon >= 60 && lon <= 92) return "South Asia";
  if (lon >= 92 && lon <= 100 && lat < 30 && lat > -12) return "Southeast Asia and Oceania";
  if (lat >= 22 && lat <= 55 && lon >= 100 && lon <= 150) return "East Asia";
  if ((lon >= 92 && lat < 22) || (lat < -10 && lon >= 110) || lon > 150 || lon <= -170) return "Southeast Asia and Oceania";
  if (lat >= -40 && lat < 19 && lon >= -20 && lon <= 55) return "Sub-Saharan Africa";
  if (lat >= 30 && lon >= 40) return "Russia, Central and North Asia";
  return "Other (oceans, polar)";
}
const REGIONS = [
  "Europe", "North Africa", "Anatolia and Middle East", "Sub-Saharan Africa", "South Asia", "East Asia",
  "Southeast Asia and Oceania", "Russia, Central and North Asia", "Americas north of 15°N", "Americas south of 15°N", "Other (oceans, polar)",
];

type Box = { name: string; south: number; north: number; west: number; east: number };
const SPOTLIGHTS: Box[] = [
  { name: "Greece and Aegean", south: 34.5, north: 42, west: 19, east: 29 },
  { name: "Italy", south: 36, north: 47, west: 6.5, east: 18.5 },
  { name: "Nile valley (Egypt)", south: 22, north: 31.6, west: 25, east: 35 },
  { name: "Mesopotamia and Levant", south: 29, north: 38, west: 34, east: 49 },
  { name: "Ganges plain", south: 20, north: 31, west: 72, east: 90 },
  { name: "Eastern China", south: 20, north: 42, west: 100, east: 123 },
  { name: "West Africa", south: 4, north: 17, west: -18, east: 10 },
  { name: "Mesoamerica", south: 13, north: 23, west: -106, east: -86 },
  { name: "Andes", south: -20, north: 2, west: -82, east: -65 },
];
const ERAS: [string, number, number][] = [
  ["before 1000 BCE", MIN_YEAR, -1001],
  ["1000 to 501 BCE", -1000, -501],
  ["500 to 1 BCE", -500, -1],
  ["1 to 500", 1, 500],
  ["501 to 1000", 501, 1000],
  ["1001 to 1500", 1001, 1500],
  ["1501 to 1800", 1501, 1800],
  ["1801 to 1900", 1801, 1900],
  ["1901 to now", 1901, MAX_YEAR],
];
const inBox = (r: EventRecord, b: Box) => r.lat >= b.south && r.lat <= b.north && r.lon >= b.west && r.lon <= b.east;
const overlapsYears = (r: EventRecord, from: number, to: number) => r.startYear <= to && r.endYear >= from;

// ---------- formatting ----------

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
function table(headers: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => (typeof v === "number" ? fmt(v) : v);
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");
}
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return n + (teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");
}
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

// ---------- load ----------

type ClassStats = { c: ClassConfig; fetched: number; records: EventRecord[]; rejections: Map<Rejection, number>; queries: number; queryMs: number };

function loadClass(c: ClassConfig): ClassStats | null {
  const dir = join(RAW_DIR, c.key);
  if (!existsSync(join(dir, "items.json"))) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const byFacet: Record<string, RawFile["bindings"]> = { items: [], meta: [], dates: [], locs: [], labels: [] };
  let queryMs = 0;
  for (const f of files) {
    const raw: RawFile = JSON.parse(readFileSync(join(dir, f), "utf8"));
    byFacet[raw.part.split("-")[0]].push(...raw.bindings);
    queryMs += raw.elapsedMs;
  }
  const facts = collectFacts(byFacet.items, byFacet.meta, byFacet.dates, byFacet.locs, byFacet.labels);
  const records: EventRecord[] = [];
  const rejections = new Map<Rejection, number>();
  for (const f of facts.values()) {
    const r = normalize(c, f);
    if (r.ok) records.push(r.record);
    else rejections.set(r.reason, (rejections.get(r.reason) ?? 0) + 1);
  }
  return { c, fetched: facts.size, records, rejections, queries: files.length, queryMs };
}

// ---------- report ----------

function main() {
  const config = loadConfig();
  const stats = config.classes.map(loadClass).filter((s): s is ClassStats => s !== null);
  const missing = config.classes.filter((c) => !stats.some((s) => s.c.key === c.key)).map((c) => c.key);

  // Dedupe across classes: an item keeps the highest-priority category (classes.json categoryPriority).
  const prio = (cat: string) => config.categoryPriority.indexOf(cat);
  const strictByQid = new Map<string, EventRecord>();
  const candidateByQid = new Map<string, EventRecord>();
  const classCount = new Map<string, number>();
  for (const s of stats) {
    for (const r of s.records) {
      classCount.set(r.qid, (classCount.get(r.qid) ?? 0) + 1);
      const target = s.c.candidate ? candidateByQid : strictByQid;
      const prev = target.get(r.qid);
      if (!prev || prio(r.category) < prio(prev.category)) target.set(r.qid, r);
    }
  }
  for (const q of strictByQid.keys()) candidateByQid.delete(q); // an event that is also a structure counts as an event
  const inRange = (r: EventRecord) => overlapsYears(r, MIN_YEAR, MAX_YEAR);
  const strict = [...strictByQid.values()].filter(inRange);
  const byClass = (key: string) => [...candidateByQid.values()].filter((r) => r.classKey === key && inRange(r));
  const structures = [...byClass("structure"), ...byClass("archaeological-site")];
  const births = byClass("birth");
  const groups: [string, EventRecord[]][] = [["Strict events", strict], ["Structures and sites (candidate)", structures], ["Births (candidate)", births]];

  const out: string[] = [];
  const h = (s: string) => out.push(`\n### ${s}\n`);
  out.push(`Generated ${new Date().toISOString().slice(0, 10)} from \`data/raw/\`. Year window: ${formatYear(MIN_YEAR)} to ${MAX_YEAR} (overlap test on effective intervals).`);
  if (missing.length) out.push(`\n**Incomplete: no raw data yet for ${missing.join(", ")}.**`);

  h("A. Fetch and normalization, per class");
  const reasons: Rejection[] = ["no-label", "no-date", "bad-date", "no-location", "country-only"];
  out.push(table(
    ["Class", "Floor (sitelinks)", "Fetched", "Usable", ...reasons, "Exact loc", "Queries"],
    stats.map((s) => [
      `${s.c.key}${s.c.candidate ? " (candidate)" : ""}`,
      s.c.minSitelinks,
      s.fetched,
      s.records.length,
      ...reasons.map((r) => s.rejections.get(r) ?? 0),
      pct(s.records.filter((r) => r.locConfidence === "exact").length, s.records.length),
      s.queries,
    ]),
  ));
  const multi = [...classCount.values()].filter((n) => n > 1).length;
  const totalQueries = stats.reduce((a, s) => a + s.queries, 0);
  const totalMin = Math.round(stats.reduce((a, s) => a + s.queryMs, 0) / 60000);
  out.push(`\nUsable items that matched more than one class: ${fmt(multi)} (deduped by category priority: ${config.categoryPriority.join(" > ")}). Total queries: ${fmt(totalQueries)}, total server time about ${totalMin} min.`);

  h("B. Usable items by category (deduped, in year window)");
  const cats = [...new Set(config.classes.map((c) => c.category))];
  out.push(table(["Category", "Strict events", "Candidates"], cats.map((cat) => [cat, strict.filter((r) => r.category === cat).length, [...structures, ...births].filter((r) => r.category === cat).length])));
  out.push(`\nStrict events total: **${fmt(strict.length)}**. Structures and sites: ${fmt(structures.length)}. Births: ${fmt(births.length)}.`);

  h("C. Location confidence");
  out.push(table(
    ["Group", "Usable", "Exact (own P625)", "Inherited P276", "Inherited P131", "Inherited P19", "Several places to pick from"],
    groups.map(([name, rs]) => [
      name, rs.length,
      pct(rs.filter((r) => r.locSource === "P625").length, rs.length),
      pct(rs.filter((r) => r.locSource === "P276").length, rs.length),
      pct(rs.filter((r) => r.locSource === "P131").length, rs.length),
      pct(rs.filter((r) => r.locSource === "P19").length, rs.length),
      pct(rs.filter((r) => r.locChoices > 1).length, rs.length),
    ]),
  ));

  h("C2. Label language (strict events)");
  out.push("Items with no English label fall back to `mul` (language-neutral), then other languages (`chooseLabel` in `etl/normalize.ts`).\n");
  const langOf = (r: EventRecord) => (r.labelLang === "en" || r.labelLang === "mul" ? r.labelLang : "other");
  out.push(table(
    ["Region", "Events", "English label", "mul label", "Other language only"],
    REGIONS.map((reg) => {
      const rs = strict.filter((r) => region(r.lat, r.lon) === reg);
      return [reg, rs.length, ...["en", "mul", "other"].map((l) => pct(rs.filter((r) => langOf(r) === l).length, rs.length))];
    }),
  ));
  const otherLangs = new Map<string, number>();
  for (const r of strict) if (langOf(r) === "other") otherLangs.set(r.labelLang, (otherLangs.get(r.labelLang) ?? 0) + 1);
  const topLangs = [...otherLangs].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([l, n]) => `${l} ${fmt(n)}`).join(", ");
  out.push(`\nStrict events with a non-English, non-mul label: ${fmt([...otherLangs.values()].reduce((a, b) => a + b, 0))}. Most common languages: ${topLangs || "none"}.`);

  h("D. Strict events by coarse region and era");
  out.push("Approximate lat/lon boxes, first match wins (see `region()` in `etl/audit.ts`). An event spanning two eras counts in both.\n");
  out.push(table(
    ["Region", ...ERAS.map((e) => e[0]), "Total"],
    REGIONS.map((reg) => {
      const rs = strict.filter((r) => region(r.lat, r.lon) === reg);
      return [reg, ...ERAS.map(([, a, b]) => rs.filter((r) => overlapsYears(r, a, b)).length), rs.length];
    }),
  ));
  h("D2. Candidates by coarse region");
  out.push(table(
    ["Region", "Strict events", "Structures and sites", "Births"],
    REGIONS.map((reg) => [reg, ...groups.map(([, rs]) => rs.filter((r) => region(r.lat, r.lon) === reg).length)]),
  ));

  h("E. By century (effective start year), 3500 BCE to now");
  const centuries: number[] = [];
  for (let c = -35; c <= 21; c++) if (c !== 0) centuries.push(c);
  const centuryOf = (y: number) => (y < 0 ? -Math.ceil(-y / 100) : Math.ceil(y / 100));
  const centLabel = (c: number) => (c < 0 ? `${ordinal(-c)} c. BCE` : `${ordinal(c)} c.`);
  const counts = (rs: EventRecord[]) => {
    const m = new Map<number, number>();
    for (const r of rs) {
      const c = centuryOf(Math.max(r.startYear, MIN_YEAR));
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  };
  const cm = groups.map(([, rs]) => counts(rs));
  const strictConflict = counts(strict.filter((r) => r.category === "conflict"));
  out.push(table(
    ["Century", "Strict events", "of which conflict", "Structures and sites", "Births"],
    centuries.map((c) => [centLabel(c), cm[0].get(c) ?? 0, pct(strictConflict.get(c) ?? 0, cm[0].get(c) ?? 0), cm[1].get(c) ?? 0, cm[2].get(c) ?? 0]),
  ));
  const allStrict = [...strictByQid.values()];
  out.push(`\nOutside the window (dropped): ${fmt(allStrict.filter((r) => r.endYear < MIN_YEAR).length)} strict events end before ${formatYear(MIN_YEAR)}, ${fmt(allStrict.filter((r) => r.startYear > MAX_YEAR).length)} start after ${MAX_YEAR}.`);
  const prec = (rs: EventRecord[], p: (n: number) => boolean) => pct(rs.filter((r) => p(r.yearPrecision)).length, rs.length);
  out.push(table(
    ["Date precision", "Strict events", "Structures and sites", "Births"],
    [
      ["day or month (10 to 11)", ...groups.map(([, rs]) => prec(rs, (n) => n >= 10))],
      ["year (9)", ...groups.map(([, rs]) => prec(rs, (n) => n === 9))],
      ["decade (8)", ...groups.map(([, rs]) => prec(rs, (n) => n === 8))],
      ["century (7)", ...groups.map(([, rs]) => prec(rs, (n) => n === 7))],
      ["millennium or coarser (6 or less)", ...groups.map(([, rs]) => prec(rs, (n) => n <= 6))],
    ],
  ));

  h("F. Sitelink distribution");
  const thresholds = [1, 2, 3, 5, 10, 20, 50, 100];
  out.push(table(
    ["Group", "Median", "p90", "p99", ...thresholds.map((t) => `≥${t}`)],
    groups.map(([name, rs]) => {
      const s = rs.map((r) => r.sitelinks).sort((a, b) => a - b);
      return [name, quantile(s, 0.5), quantile(s, 0.9), quantile(s, 0.99), ...thresholds.map((t) => s.filter((x) => x >= t).length)];
    }),
  ));
  out.push("\nCandidates were fetched with a floor (structures ≥5, births ≥20), so their counts below the floor are zero by construction.\n");
  out.push(table(
    ["Strict events: sitelinks ≥ t, by era", ...thresholds.slice(0, 6).map((t) => `≥${t}`)],
    ERAS.map(([name, a, b]) => {
      const rs = strict.filter((r) => overlapsYears(r, a, b));
      return [name, ...thresholds.slice(0, 6).map((t) => rs.filter((r) => r.sitelinks >= t).length)];
    }),
  ));
  out.push("\nDoes a threshold cut some regions harder than others? Share of each region's strict events that survive:\n");
  out.push(table(
    ["Region", "Events (≥1)", "kept at ≥2", "kept at ≥3", "kept at ≥5", "kept at ≥10"],
    REGIONS.map((reg) => {
      const rs = strict.filter((r) => region(r.lat, r.lon) === reg);
      return [reg, rs.length, ...[2, 3, 5, 10].map((t) => pct(rs.filter((r) => r.sitelinks >= t).length, rs.length))];
    }),
  ));

  h("G. Spotlights: focus areas by era");
  const spotEras: [string, number, number][] = [["1000 to 501 BCE", -1000, -501], ["500 to 300 BCE", -500, -300], ["299 to 1 BCE", -299, -1], ["1 to 500", 1, 500], ["1001 to 1500", 1001, 1500]];
  out.push("Cells: strict events / structures and sites / births.\n");
  out.push(table(
    ["Area", ...spotEras.map((e) => e[0])],
    SPOTLIGHTS.map((b) => [b.name, ...spotEras.map(([, a, z]) => groups.map(([, rs]) => rs.filter((r) => inBox(r, b) && overlapsYears(r, a, z)).length).join(" / "))]),
  ));

  h("H. Greece and Aegean, 500 to 300 BCE: top items by sitelinks");
  const greece = SPOTLIGHTS[0];
  const top = (rs: EventRecord[], n: number) => rs.filter((r) => inBox(r, greece) && overlapsYears(r, -500, -300)).sort((a, b) => b.sitelinks - a.sitelinks).slice(0, n);
  const row = (r: EventRecord) => [r.label, r.qid, r.startYear === r.endYear ? formatYear(r.startYear) : `${formatYear(r.startYear)} to ${formatYear(r.endYear)}`, r.yearPrecision, r.category, r.locConfidence, r.sitelinks];
  const hdr = ["Label", "QID", "Years", "Precision", "Category", "Location", "Sitelinks"];
  out.push("Strict events:\n");
  out.push(table(hdr, top(strict, 25).map(row)));
  out.push("\nStructures and sites:\n");
  out.push(table(hdr, top(structures, 10).map(row)));
  out.push("\nBirths:\n");
  out.push(table(hdr, top(births, 10).map(row)));

  h("I. Spot checks (year convention end to end)");
  const allRecords = new Map<string, EventRecord>();
  for (const s of stats) for (const r of s.records) allRecords.set(r.qid, r);
  const checks: [string, string, number][] = [["Battle of Marathon", "Q31900", -490], ["Battle of Salamis", "Q178850", -480], ["eruption of Mount Vesuvius in 79", "Q2411998", 79], ["Fall of Constantinople", "Q160077", 1453]];
  out.push(table(
    ["Event", "QID", "Expected", "Got", "Location", "Result"],
    checks.map(([name, qid, want]) => {
      const r = allRecords.get(qid);
      if (!r) return [name, qid, formatYear(want), "not in data", "", "**MISSING**"];
      const got = r.startYear === r.endYear ? formatYear(r.startYear) : `${formatYear(r.startYear)} to ${formatYear(r.endYear)}`;
      const ok = r.startYear <= want && r.endYear >= want;
      return [name, qid, formatYear(want), got, `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)} (${r.locConfidence}, ${r.classKey})`, ok ? "pass" : "**FAIL**"];
    }),
  ));

  const body = out.join("\n");
  const existing = existsSync(REPORT) ? readFileSync(REPORT, "utf8") : `# Data audit\n\n${BEGIN}\n${END}\n`;
  const i = existing.indexOf(BEGIN);
  const j = existing.indexOf(END);
  if (i < 0 || j < 0) throw new Error(`Markers missing in ${REPORT}`);
  writeFileSync(REPORT, `${existing.slice(0, i + BEGIN.length)}\n${body}\n${existing.slice(j)}`);
  console.log(`Wrote ${REPORT}: ${fmt(strict.length)} strict events, ${fmt(structures.length)} structures, ${fmt(births.length)} births`);
}

if (import.meta.main) main();
