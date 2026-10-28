/**
 * Turn raw facet rows into one record per item, or a reason the item cannot be used.
 * Shared by the Phase 0 audit and the Phase 1 loader.
 */
import { effectiveInterval, yearFromSparqlTime } from "../lib/time/index.ts";
import type { ClassConfig, Kind } from "./queries.ts";
import type { Binding } from "./sparql.ts";

export type Rank = "preferred" | "normal" | "deprecated";
export type DateValue = { prop: string; year: number; precision: number; rank: Rank };
export type LocValue = { src: string; place: string; lat: number; lon: number; stopped: boolean };

export type ItemFacts = {
  qid: string;
  sitelinks: number;
  label?: string; // English, from meta
  /** Labels in other languages, from the labels facet (only fetched when there is no English label). */
  otherLabels: { lang: string; value: string }[];
  description?: string;
  enwiki?: string;
  dates: DateValue[];
  locs: LocValue[];
};

export type EventRecord = {
  qid: string;
  classKey: string;
  kind: Kind;
  category: string;
  label: string;
  /** Language of `label`: "en", "mul" (language-neutral), or another code when no English label exists. */
  labelLang: string;
  description?: string;
  wikipediaTitle?: string;
  sitelinks: number;
  startYear: number;
  endYear: number;
  origYear: number;
  yearPrecision: number;
  lat: number;
  lon: number;
  locConfidence: "exact" | "inherited";
  locSource: string;
  /** How many distinct usable places competed at the chosen source (more than 1 means we picked one). */
  locChoices: number;
};

export type Rejection = "no-label" | "no-date" | "bad-date" | "no-location" | "country-only";
export type NormalizeResult = { ok: true; record: EventRecord } | { ok: false; reason: Rejection };

const END_PROP = "P582";
const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);

export function parseRank(uri: string): Rank {
  const r = uri.slice(uri.lastIndexOf("#") + 1);
  if (r === "PreferredRank") return "preferred";
  if (r === "NormalRank") return "normal";
  if (r === "DeprecatedRank") return "deprecated";
  throw new Error(`Unknown rank: ${uri}`);
}

/** WKT "Point(lon lat)". Returns null for non-Earth globes ("<http://...> Point(...)") or junk. */
export function parseWktPoint(wkt: string): { lat: number; lon: number } | null {
  const m = /^Point\(([-\d.eE+]+) ([-\d.eE+]+)\)$/.exec(wkt.trim());
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Group membership + facet rows into per-item facts. */
export function collectFacts(items: Binding[], meta: Binding[], dates: Binding[], locs: Binding[], labels: Binding[] = []): Map<string, ItemFacts> {
  const facts = new Map<string, ItemFacts>();
  for (const b of items) {
    const qid = qidOf(b.item.value);
    const sl = Number(b.sl.value);
    const prev = facts.get(qid);
    if (!prev) facts.set(qid, { qid, sitelinks: sl, otherLabels: [], dates: [], locs: [] });
    else prev.sitelinks = Math.max(prev.sitelinks, sl);
  }
  const get = (b: Binding) => facts.get(qidOf(b.item.value));
  for (const b of meta) {
    const f = get(b);
    if (!f) continue;
    f.label ??= b.label?.value;
    f.description ??= b.desc?.value;
    f.enwiki ??= b.enwiki?.value;
  }
  for (const b of labels) {
    const lang = b.label["xml:lang"];
    const f = get(b);
    if (f && lang) f.otherLabels.push({ lang, value: b.label.value });
  }
  for (const b of dates) {
    const f = get(b);
    if (!f) continue;
    let year: number;
    try {
      year = yearFromSparqlTime(b.t.value);
    } catch {
      continue; // unparseable time value: treated as missing
    }
    f.dates.push({ prop: b.prop.value, year, precision: Number(b.prec.value), rank: parseRank(b.rank.value) });
  }
  // A place is stopped if ANY of its rows matched the stoplist.
  const locIndex = new Map<string, LocValue>();
  for (const b of locs) {
    const f = get(b);
    if (!f) continue;
    const pt = parseWktPoint(b.coord.value);
    if (!pt) continue;
    const place = qidOf(b.place.value);
    const key = `${f.qid}|${b.src.value}|${place}|${pt.lat}|${pt.lon}`;
    const existing = locIndex.get(key);
    const stopped = b.src.value !== "P625" && b.stop !== undefined;
    if (existing) {
      existing.stopped ||= stopped;
      continue;
    }
    const loc = { src: b.src.value, place, ...pt, stopped };
    locIndex.set(key, loc);
    f.locs.push(loc);
  }
  return facts;
}

/** Best-ranked, non-deprecated values of one property. */
function bestRanked(values: DateValue[]): DateValue[] {
  const live = values.filter((v) => v.rank !== "deprecated");
  const preferred = live.filter((v) => v.rank === "preferred");
  return preferred.length ? preferred : live;
}

export function chooseDates(c: ClassConfig, dates: DateValue[]): { start: number; end: number; origYear: number; precision: number } | Rejection {
  const startProps = c.dateProps.filter((p) => p !== END_PROP);
  let starts: DateValue[] = [];
  for (const p of startProps) {
    starts = bestRanked(dates.filter((d) => d.prop === p));
    if (starts.length) break;
  }
  if (!starts.length) return "no-date";
  try {
    const intervals = starts.map((d) => ({ d, i: effectiveInterval(d.year, d.precision) }));
    const earliest = intervals.reduce((a, b) => (b.i.start < a.i.start ? b : a));
    let end = Math.max(...intervals.map((x) => x.i.end));
    const ends = bestRanked(dates.filter((d) => d.prop === END_PROP));
    if (ends.length) {
      const endMax = Math.max(...ends.map((d) => effectiveInterval(d.year, d.precision).end));
      if (endMax >= earliest.i.start) end = Math.max(end, endMax);
    }
    return { start: earliest.i.start, end, origYear: earliest.d.year, precision: earliest.d.precision };
  } catch {
    return "bad-date";
  }
}

export function chooseLocation(c: ClassConfig, locs: LocValue[]): Pick<EventRecord, "lat" | "lon" | "locConfidence" | "locSource" | "locChoices"> | Rejection {
  if (!locs.length) return "no-location";
  for (const src of c.locProps) {
    const usable = locs.filter((l) => l.src === src && !l.stopped);
    if (!usable.length) continue;
    // Deterministic pick: lowest place QID, then coordinates.
    usable.sort((a, b) => Number(a.place.slice(1)) - Number(b.place.slice(1)) || a.lat - b.lat || a.lon - b.lon);
    const pick = usable[0];
    return {
      lat: pick.lat,
      lon: pick.lon,
      locConfidence: src === "P625" ? "exact" : "inherited",
      locSource: src,
      locChoices: new Set(usable.map((l) => l.place)).size,
    };
  }
  return "country-only";
}

/** After English and "mul": widely read languages first, then any other, by language code. */
const LABEL_FALLBACK = ["mul", "fr", "es", "de", "it", "pt", "nl", "ru", "zh", "ja", "ar"];

export function chooseLabel(f: Pick<ItemFacts, "label" | "otherLabels">): { label: string; labelLang: string } | null {
  if (f.label) return { label: f.label, labelLang: "en" };
  const rank = (lang: string) => {
    const i = LABEL_FALLBACK.indexOf(lang);
    return i < 0 ? LABEL_FALLBACK.length : i;
  };
  const best = [...f.otherLabels].sort((a, b) => rank(a.lang) - rank(b.lang) || a.lang.localeCompare(b.lang))[0];
  return best ? { label: best.value, labelLang: best.lang } : null;
}

export function normalize(c: ClassConfig, f: ItemFacts): NormalizeResult {
  const label = chooseLabel(f);
  if (!label) return { ok: false, reason: "no-label" };
  const dates = chooseDates(c, f.dates);
  if (typeof dates === "string") return { ok: false, reason: dates };
  const loc = chooseLocation(c, f.locs);
  if (typeof loc === "string") return { ok: false, reason: loc };
  return {
    ok: true,
    record: {
      qid: f.qid,
      classKey: c.key,
      kind: c.kind,
      category: c.category,
      ...label,
      description: f.description,
      wikipediaTitle: f.enwiki,
      sitelinks: f.sitelinks,
      startYear: dates.start,
      endYear: dates.end,
      origYear: dates.origYear,
      yearPrecision: dates.precision,
      ...loc,
    },
  };
}
