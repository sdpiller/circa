/**
 * GET /api/summary?qid=Q123
 * English Wikipedia opening paragraph for an item in the events database, cached in data/cache.db.
 * Takes a Wikidata id, not a title, so it is no open proxy: see summaryResponse in lib/wiki/summary.ts.
 */
import type { NextRequest } from "next/server";
import { getCacheDb, sqliteSummaryCache } from "../../../lib/db/cache.ts";
import { getDb } from "../../../lib/db/connection.ts";
import { summaryResponse } from "../../../lib/wiki/summary.ts";

export async function GET(request: NextRequest) {
  return summaryResponse(request.nextUrl.searchParams.get("qid"), {
    db: getDb(),
    cache: sqliteSummaryCache(getCacheDb()),
    fetch,
    contact: process.env.WIKIMEDIA_CONTACT,
  });
}
