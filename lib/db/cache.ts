/**
 * Writable cache database (data/cache.db), separate from the read-only main database.
 * Kept on globalThis so dev-server hot reloads reuse it.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { Summary, SummaryCache } from "../wiki/summary.ts";

const CACHE_PATH = join(process.cwd(), "data", "cache.db");
const DAY_MS = 86_400_000;
const OK_TTL_MS = 30 * DAY_MS;
const MISSING_TTL_MS = 7 * DAY_MS;

const holder = globalThis as unknown as { chronoglobeCacheDb?: Database.Database };

export function getCacheDb(): Database.Database {
  if (!holder.chronoglobeCacheDb) {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    const db = new Database(CACHE_PATH);
    db.pragma("journal_mode = WAL");
    holder.chronoglobeCacheDb = db;
  }
  return holder.chronoglobeCacheDb;
}

export function sqliteSummaryCache(db: Database.Database, now: () => number = Date.now): SummaryCache {
  db.exec(
    "CREATE TABLE IF NOT EXISTS summaries (title TEXT PRIMARY KEY, status TEXT NOT NULL, body TEXT, fetched_at TEXT NOT NULL)",
  );
  const select = db.prepare("SELECT status, body, fetched_at FROM summaries WHERE title = ?");
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO summaries (title, status, body, fetched_at) VALUES (?, ?, ?, ?)",
  );
  return {
    get(title) {
      const row = select.get(title) as { status: string; body: string | null; fetched_at: string } | undefined;
      if (!row) return undefined;
      const age = now() - Date.parse(row.fetched_at);
      if (row.status === "ok" && row.body) {
        return age > OK_TTL_MS ? undefined : { status: "ok", summary: JSON.parse(row.body) as Summary };
      }
      return age > MISSING_TTL_MS ? undefined : { status: "missing" };
    },
    put(title, value) {
      const at = new Date(now()).toISOString();
      if (value === "missing") upsert.run(title, "missing", null, at);
      else upsert.run(title, "ok", JSON.stringify(value), at);
    },
  };
}
