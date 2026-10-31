/**
 * Times the area API on the real database and checks what it returns (spec 5.4). Target: under 150 ms
 * and about 200 KB. Fails on a broken outline or list; the times are for reading.
 *
 * Usage: npm run bench:area
 */
import { queryArea, type AreaAnswer, type AreaQueryInput } from "../lib/db/area.ts";
import { getDb } from "../lib/db/connection.ts";
import { PUBLISHED } from "../lib/stories/catalog.ts";

type Click = { name: string; lon: number; lat: number; from: number; to: number; intent?: "click" | "range" };

const ALL_TIME = { from: -3500, to: 2026 };

const CLICKS: Click[] = [
  // Europe, including ranges just under the span limit, which read the most region rows
  { name: "Rome, Roman era", lon: 12.5, lat: 41.9, from: -300, to: 199 },
  { name: "Paris, late medieval on", lon: 2.35, lat: 48.85, from: 1400, to: 1899 },
  { name: "Vienna, wide", lon: 16.37, lat: 48.2, from: 1200, to: 1699 },
  { name: "Berlin, recent", lon: 13.4, lat: 52.5, from: 1527, to: 2026 },
  { name: "Warsaw, wide", lon: 21.0, lat: 52.2, from: 1000, to: 1499 },
  { name: "London, medieval", lon: -0.12, lat: 51.5, from: 800, to: 1299 },
  { name: "Madrid, wide", lon: -3.7, lat: 40.4, from: 700, to: 1199 },
  { name: "Istanbul, wide", lon: 28.97, lat: 41.0, from: 900, to: 1399 },
  { name: "Moscow, recent", lon: 37.6, lat: 55.75, from: 1500, to: 1999 },
  { name: "Reykjavik, medieval", lon: -21.9, lat: 64.1, from: 900, to: 1100 },
  { name: "Oslo, coast", lon: 10.75, lat: 59.9, from: 1000, to: 1300 },
  { name: "Slovenia, many provinces", lon: 14.5, lat: 46.05, from: 1800, to: 1900 },
  { name: "Britain, all time", lon: -1.5, lat: 53.0, ...ALL_TIME },
  // The slowest kind found by a sweep of 1,500 random clicks: 500 years ending near today read the most and largest region rows.
  { name: "Malta, recent", lon: 14.45, lat: 35.91, from: 1527, to: 2026 },
  { name: "Genoa, recent", lon: 9.21, lat: 44.34, from: 1500, to: 1999 },
  // Asia
  { name: "Baghdad, Abbasid", lon: 44.4, lat: 33.3, from: 800, to: 900 },
  { name: "Persepolis", lon: 52.9, lat: 29.9, from: -500, to: -300 },
  { name: "Samarkand, wide", lon: 66.96, lat: 39.65, from: 1000, to: 1499 },
  { name: "Delhi, wide", lon: 77.2, lat: 28.6, from: 1200, to: 1699 },
  { name: "Xi'an, Han", lon: 108.9, lat: 34.3, from: -200, to: 200 },
  { name: "Tokyo, Edo", lon: 139.7, lat: 35.7, from: 1603, to: 1868 },
  { name: "Manila, islands", lon: 120.98, lat: 14.6, from: 1500, to: 1900 },
  { name: "Philippines, all time", lon: 125.0, lat: 8.0, ...ALL_TIME },
  { name: "Jakarta, islands", lon: 106.85, lat: -6.2, from: 1600, to: 1900 },
  { name: "Angkor", lon: 103.87, lat: 13.41, from: 900, to: 1300 },
  { name: "Yakutsk, all time", lon: 129.7, lat: 62.0, ...ALL_TIME },
  // Africa
  { name: "Cairo, Pharaonic", lon: 31.25, lat: 30.05, from: -2500, to: -2100 },
  { name: "Timbuktu", lon: -3.0, lat: 16.77, from: 1300, to: 1500 },
  { name: "Lagos", lon: 3.4, lat: 6.45, from: 1800, to: 1950 },
  { name: "Axum", lon: 38.72, lat: 14.12, from: 100, to: 600 },
  { name: "Kinshasa", lon: 15.3, lat: -4.3, from: 1500, to: 1900 },
  { name: "Chad, recent", lon: 16.95, lat: 14.53, from: 1500, to: 1999 },
  { name: "Cape Town", lon: 18.42, lat: -33.92, from: 1650, to: 1900 },
  { name: "Uganda, all time", lon: 32.58, lat: 0.32, ...ALL_TIME },
  // Americas
  { name: "New York", lon: -74.0, lat: 40.7, from: 1600, to: 1800 },
  { name: "Mexico City, ancient", lon: -99.13, lat: 19.43, from: -500, to: 500 },
  { name: "Cahokia", lon: -90.06, lat: 38.65, from: 1000, to: 1300 },
  { name: "Lima", lon: -77.03, lat: -12.05, from: 1400, to: 1600 },
  { name: "Rio", lon: -43.2, lat: -22.9, from: 1500, to: 1900 },
  { name: "Nunavut, largest province", lon: -90.0, lat: 72.0, from: 1800, to: 1900 },
  { name: "Canadian Arctic, all time", lon: -85.0, lat: 70.0, ...ALL_TIME },
  { name: "Anchorage, Alaska", lon: -149.9, lat: 61.2, from: 1700, to: 1900 },
  // Oceania, the antimeridian, and nothing
  { name: "Sydney", lon: 151.2, lat: -33.87, from: 1788, to: 1900 },
  { name: "Auckland", lon: 174.76, lat: -36.85, from: 1300, to: 1800 },
  { name: "Fiji, over the antimeridian", lon: 179.9, lat: -17.0, from: 1800, to: 1900 },
  { name: "Chukotka, over the antimeridian", lon: -175.0, lat: 66.0, ...ALL_TIME },
  { name: "Mid Pacific, open water", lon: -150.0, lat: 10.0, from: 1500, to: 1900 },
];

const STORY_CLICKS: (Click & { story: string })[] = PUBLISHED.map((s) => ({
  name: s.entry.place,
  story: s.entry.id,
  lon: s.point[0],
  lat: s.point[1],
  from: s.entry.from,
  to: s.entry.to,
  intent: "range",
}));

const db = getDb();
const provinceOf = db.prepare("SELECT province_id FROM events WHERE qid = ?");

function ask(c: Click): { answer: AreaAnswer; ms: number; kb: number } {
  const q: AreaQueryInput = { lat: c.lat, lon: c.lon, from: c.from, to: c.to, intent: c.intent ?? "click", eventsLimit: 25, othersLimit: 30 };
  const started = performance.now();
  const answer = queryArea(db, q);
  const ms = performance.now() - started;
  return { answer, ms, kb: Buffer.byteLength(JSON.stringify(answer)) / 1024 };
}

function problems(a: AreaAnswer): string[] {
  const out: string[] = [];
  const s = a.selection;
  if (s.kind === "none") return out;
  if (s.name.trim() === "") out.push("empty name");
  if (s.openChains > 0) out.push(`${s.openChains} open chains`);
  for (const [ring] of s.fill.coordinates) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (ring.length < 4 || first[0] !== last[0] || first[1] !== last[1]) out.push("open ring");
  }
  const ids = new Set(s.provinceIds);
  for (const item of [...a.events, ...a.others]) {
    const row = provinceOf.get(item.qid) as { province_id: string | null };
    if (row.province_id === null || !ids.has(row.province_id)) out.push(`${item.qid} is outside the outline`);
  }
  return out;
}

const title = (a: AreaAnswer) => (a.selection.kind === "none" ? "(none)" : a.selection.name);
const cell = (s: string, n: number) => s.padEnd(n).slice(0, n);

// The first click reads the province index and prepares the statements, so it is reported on its own.
const cold = ask(CLICKS[0]);
console.log(`first click after start: ${cold.ms.toFixed(0)} ms\n`);

const failures: string[] = [];
const results: { ms: number; kb: number; label: string }[] = [];
console.log(`${cell("click", 34)} ${cell("kind", 10)} ${cell("outline", 34)} ${"ms".padStart(6)} ${"KB".padStart(7)} ${"prov".padStart(5)} events`);

function report(c: Click): AreaAnswer {
  const { answer, ms, kb } = ask(c);
  const s = answer.selection;
  const ids = s.kind === "none" ? 0 : s.provinceIds.length;
  console.log(`${cell(c.name, 34)} ${cell(s.kind, 10)} ${cell(title(answer), 34)} ${ms.toFixed(1).padStart(6)} ${kb.toFixed(1).padStart(7)} ${String(ids).padStart(5)} ${answer.eventsTotal}`);
  results.push({ ms, kb, label: c.name });
  for (const p of problems(answer)) failures.push(`${c.name}: ${p}`);
  return answer;
}

for (const c of CLICKS) report(c);
console.log("\nStories, at each story's point and exact years:");
const names: string[] = [];
for (const c of STORY_CLICKS) {
  const answer = report(c);
  if (answer.storyId !== c.story) failures.push(`${c.name}: its point and years gave story ${answer.storyId}`);
  const s = answer.selection;
  names.push(`${cell(c.name, 16)} ${s.kind === "none" ? "(none)" : `${s.name}${s.kind === "modern" ? ", modern borders" : ` (${s.source})`}${s.capped ? ", capped" : ""}`}`);
}

const byMs = [...results].sort((a, b) => a.ms - b.ms);
const byKb = [...results].sort((a, b) => b.kb - a.kb);
console.log(`\n${results.length} clicks: p50 ${byMs[Math.floor(byMs.length / 2)].ms.toFixed(1)} ms, max ${byMs[byMs.length - 1].ms.toFixed(1)} ms (${byMs[byMs.length - 1].label}), max payload ${byKb[0].kb.toFixed(1)} KB (${byKb[0].label})`);
console.log(`slowest: ${byMs.slice(-5).reverse().map((r) => `${r.label} ${r.ms.toFixed(0)}`).join(", ")}`);
console.log(`largest: ${byKb.slice(0, 5).map((r) => `${r.label} ${r.kb.toFixed(0)}`).join(", ")}`);
console.log(`\nOutline names for the ${names.length} stories:\n${names.join("\n")}`);

if (failures.length > 0) {
  console.error(`\nFAILED:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("\nNo open rings, no empty names, every listed item inside its outline.");
