/**
 * The database as a deployable file (docs/PLAN.md Phase 7). etl:load writes its SHA-256 to etl/circa-db.sha256,
 * which is committed, so each commit names exactly one database. A build without data/circa.db downloads it from
 * CIRCA_DB_URL and fails unless the hash matches: a rebuilt database that was never uploaded stops the deploy.
 *
 * Usage: npm run db:fetch (runs before every npm run build)
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, rmSync, writeFileSync, createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { DB_PATH } from "../lib/db/schema.ts";

export const HASH_PATH = join(import.meta.dirname, "circa-db.sha256");

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function writeHash(dbPath = DB_PATH, hashPath = HASH_PATH): Promise<string> {
  const hex = await sha256File(dbPath);
  writeFileSync(hashPath, `${hex}\n`);
  return hex;
}

export function expectedHash(hashPath = HASH_PATH): string {
  return readFileSync(hashPath, "utf8").trim();
}

/** Streams the file to `dest`, hashing as it goes. Nothing is left at `dest` unless the hash matches. */
export async function downloadDb(url: string, dest: string, expected: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(url);
  if (!res.ok || !res.body) throw new Error(`Could not download the database: HTTP ${res.status} from ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const hash = createHash("sha256");
  const hashing = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), hashing, createWriteStream(part));
  } catch (err) {
    rmSync(part, { force: true });
    throw err;
  }
  const got = hash.digest("hex");
  if (got !== expected) {
    rmSync(part, { force: true });
    throw new Error(`The database at ${url} does not match etl/circa-db.sha256 (got ${got}, want ${expected}). Upload the database this commit was built with.`);
  }
  renameSync(part, dest);
}

async function main() {
  const expected = expectedHash();
  if (existsSync(DB_PATH)) {
    // Locally the file is whatever etl:load last built. Say so if it is not the one this commit expects.
    const got = await sha256File(DB_PATH);
    if (got !== expected) console.warn(`Warning: data/circa.db does not match etl/circa-db.sha256. Fine while working on the data; a deploy needs them to match.`);
    return;
  }
  const url = process.env.CIRCA_DB_URL;
  if (!url) throw new Error("data/circa.db is missing and CIRCA_DB_URL is not set. Run npm run etl:load, or set CIRCA_DB_URL to the uploaded database.");
  const started = Date.now();
  await downloadDb(url, DB_PATH, expected);
  console.log(`Downloaded data/circa.db in ${((Date.now() - started) / 1000).toFixed(1)} s, hash matches.`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
