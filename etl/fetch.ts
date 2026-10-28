/**
 * Fetch stage. For each class in classes.json:
 *   data/raw/<class>/items.json          membership: item QIDs + sitelinks (one query)
 *   data/raw/<class>/<facet>-<NNN>.json  meta, dates, locs for chunk NNN of CHUNK_SIZE items
 *   data/raw/<class>/labels-<NNN>.json   labels in every language, only for items with no English label
 * Resumable: any file that exists is skipped unless --force. Files are written atomically.
 * The audit (etl/audit.ts) and the Phase 1 loader both read these files.
 *
 * Usage: npm run etl:fetch -- [--only=battle,siege] [--facets=meta,dates] [--force]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { facetQuery, FACETS, membershipQuery, type ClassConfig, type Facet, type Kind } from "./queries.ts";
import { query, type Binding, type EndpointName } from "./sparql.ts";

export const RAW_DIR = join(import.meta.dirname, "..", "data", "raw");
export const CHUNK_SIZE = 1000;

export type RawFile = {
  classKey: string;
  part: string;
  endpoint: EndpointName;
  fetchedAt: string;
  elapsedMs: number;
  query: string;
  bindings: Binding[];
};

export type Config = {
  classes: ClassConfig[];
  locationStoplist: { qid: string; label: string }[];
  categoryPriority: string[];
  kindPriority: Kind[];
};

export function loadConfig(): Config {
  return JSON.parse(readFileSync(join(import.meta.dirname, "classes.json"), "utf8"));
}

export const qidOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);

export function readRaw(classKey: string, part: string): RawFile {
  return JSON.parse(readFileSync(join(RAW_DIR, classKey, `${part}.json`), "utf8"));
}

/** Stable chunking: QIDs sorted numerically, so chunk N always holds the same items. */
export function chunkQids(raw: string[]): string[][] {
  const qids = [...new Set(raw)].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const chunks: string[][] = [];
  for (let i = 0; i < qids.length; i += CHUNK_SIZE) chunks.push(qids.slice(i, i + CHUNK_SIZE));
  return chunks;
}

/** All raw files of one facet for a class, e.g. every meta-NNN.json. */
export function readFacet(classKey: string, facet: Facet): RawFile[] {
  const dir = join(RAW_DIR, classKey);
  return readdirSync(dir).filter((f) => f.startsWith(`${facet}-`) && f.endsWith(".json")).map((f) => readRaw(classKey, f.slice(0, -5)));
}

/** Items whose meta rows carry no English label. Only these get the all-languages labels lookup. */
function missingEnglishLabel(classKey: string): string[] {
  const withLabel = new Set<string>();
  const all = new Set<string>();
  for (const file of readFacet(classKey, "meta")) {
    for (const b of file.bindings) {
      all.add(qidOf(b.item.value));
      if (b.label) withLabel.add(qidOf(b.item.value));
    }
  }
  return [...all].filter((q) => !withLabel.has(q));
}

export const chunkPart = (facet: Facet, n: number) => `${facet}-${String(n).padStart(3, "0")}`;

async function fetchPart(c: ClassConfig, part: string, endpoint: EndpointName, sparql: string, force: boolean) {
  const path = join(RAW_DIR, c.key, `${part}.json`);
  if (existsSync(path) && !force) return false;
  const started = Date.now();
  const res = await query(endpoint, sparql);
  const file: RawFile = {
    classKey: c.key,
    part,
    endpoint,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    query: sparql,
    bindings: res.results.bindings,
  };
  writeFileSync(`${path}.tmp`, JSON.stringify(file));
  renameSync(`${path}.tmp`, path);
  console.log(`  ${c.key}/${part}: ${file.bindings.length} rows, ${file.elapsedMs} ms (${endpoint})`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const force = args.includes("--force");
  const only = flag("only")?.split(",");
  const facets = (flag("facets")?.split(",") ?? FACETS) as Facet[];

  const config = loadConfig();
  const stoplist = config.locationStoplist.map((s) => s.qid);
  const classes = config.classes.filter((c) => !only || only.includes(c.key));
  if (only && classes.length !== only.length) throw new Error(`Unknown class key in --only=${only.join(",")}`);

  for (const c of classes) {
    mkdirSync(join(RAW_DIR, c.key), { recursive: true });
    console.log(`${c.key} (${c.qid} ${c.label})`);
    await fetchPart(c, "items", c.membershipEndpoint ?? "wdqs", membershipQuery(c), force);
    const chunks = chunkQids(readRaw(c.key, "items").bindings.map((b) => qidOf(b.item.value)));
    let fetched = 0;
    let parts = 0;
    for (const facet of facets) {
      // labels depends on meta, so it must run after meta has been fetched for every chunk.
      const facetChunks = facet === "labels" ? chunkQids(missingEnglishLabel(c.key)) : chunks;
      parts += facetChunks.length;
      for (const [n, qids] of facetChunks.entries()) {
        if (await fetchPart(c, chunkPart(facet, n), "wdqs", facetQuery(c, facet, qids, stoplist), force)) fetched++;
      }
    }
    console.log(`  ${parts} parts (${chunks.length} chunks of ${CHUNK_SIZE}), ${fetched} fetched now`);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
