/**
 * GET /api/summary?title=...
 * English Wikipedia opening paragraph for a page title, cached in data/cache.db.
 * 200 Summary, 404 { missing: true }, 502 upstream failure, 503 when WIKIMEDIA_CONTACT is unset.
 */
import type { NextRequest } from "next/server";
import { getCacheDb, sqliteSummaryCache } from "../../../lib/db/cache.ts";
import { getSummary } from "../../../lib/wiki/summary.ts";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400" };

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title") ?? "";
  if (title.length === 0 || title.length > 300) {
    return Response.json({ error: "title must be 1 to 300 characters" }, { status: 400 });
  }
  const contact = process.env.WIKIMEDIA_CONTACT;
  if (!contact) return Response.json({ error: "WIKIMEDIA_CONTACT is not set" }, { status: 503 });

  const result = await getSummary(title, {
    cache: sqliteSummaryCache(getCacheDb()),
    fetch,
    contact,
  });
  if (result.status === "ok") return Response.json(result.summary, { headers: CACHE_HEADERS });
  if (result.status === "missing") return Response.json({ missing: true }, { status: 404, headers: CACHE_HEADERS });
  return Response.json({ error: result.reason }, { status: 502 });
}
