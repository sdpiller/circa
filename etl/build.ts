/**
 * The one definition of "the data set": raw files -> normalized, deduped, filtered records.
 * Used by both the audit and the database loader, so their counts agree by construction.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { overlaps } from "../lib/time/index.ts";
import { RAW_DIR, type Config, type RawFile } from "./fetch.ts";
import { collectFacts, normalize, type EventRecord, type Rejection } from "./normalize.ts";
import type { ClassConfig } from "./queries.ts";

export const MIN_YEAR = -3500;
export const MAX_YEAR = 2026;
/**
 * Items whose effective interval is wider than this match nearly every range query under the
 * overlap rule (for example "100000 BCE to 1 BCE"), so they are dropped. A millennium-precision
 * date spans exactly 1,000 years and is kept.
 */
export const MAX_INTERVAL_YEARS = 1000;

export type ClassStats = {
  c: ClassConfig;
  fetched: number;
  records: EventRecord[];
  rejections: Map<Rejection, number>;
  queries: number;
  queryMs: number;
};

export type Dataset = {
  stats: ClassStats[];
  /** Classes in classes.json with no raw data yet. */
  missing: string[];
  /** Deduped records that pass every filter: what goes into the database. */
  kept: EventRecord[];
  dropped: { outOfWindow: number; tooWide: number };
  /** How many classes each usable item matched, before dedupe. */
  classCount: Map<string, number>;
};

export function loadClass(c: ClassConfig): ClassStats | null {
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

/** One record per QID: the highest-priority kind wins, then the highest-priority category. */
export function dedupe(records: EventRecord[], config: Pick<Config, "kindPriority" | "categoryPriority">): EventRecord[] {
  const rank = (r: EventRecord) => {
    const k = config.kindPriority.indexOf(r.kind);
    const c = config.categoryPriority.indexOf(r.category);
    if (k < 0 || c < 0) throw new Error(`${r.qid}: kind ${r.kind} or category ${r.category} missing from the priority lists`);
    return k * 100 + c;
  };
  // Rank every record, not only duplicates, so an unknown kind or category always fails loudly.
  const byQid = new Map<string, { r: EventRecord; rank: number }>();
  for (const r of records) {
    const k = rank(r);
    const prev = byQid.get(r.qid);
    if (!prev || k < prev.rank) byQid.set(r.qid, { r, rank: k });
  }
  return [...byQid.values()].map((x) => x.r);
}

export function isTooWide(r: Pick<EventRecord, "startYear" | "endYear">): boolean {
  // Historical years have no 0, so an interval crossing 1 BCE / 1 CE is one year shorter.
  const span = r.endYear - r.startYear + 1 - (r.startYear < 0 && r.endYear > 0 ? 1 : 0);
  return span > MAX_INTERVAL_YEARS;
}

export function buildDataset(config: Config): Dataset {
  const stats = config.classes.map(loadClass).filter((s): s is ClassStats => s !== null);
  const missing = config.classes.filter((c) => !stats.some((s) => s.c.key === c.key)).map((c) => c.key);
  const allRecords = stats.flatMap((s) => s.records);
  const classCount = new Map<string, number>();
  for (const r of allRecords) classCount.set(r.qid, (classCount.get(r.qid) ?? 0) + 1);

  const kept: EventRecord[] = [];
  const dropped = { outOfWindow: 0, tooWide: 0 };
  for (const r of dedupe(allRecords, config)) {
    if (!overlaps({ start: r.startYear, end: r.endYear }, { from: MIN_YEAR, to: MAX_YEAR })) dropped.outOfWindow++;
    else if (isTooWide(r)) dropped.tooWide++;
    else kept.push(r);
  }
  return { stats, missing, kept, dropped, classCount };
}
