/**
 * GET /api/area?cell&from&to[&eventsLimit&othersLimit&focus]
 * Events and people and places in one grid cell and year range, for the area box.
 * Server-Timing reports the database time.
 */
import type { NextRequest } from "next/server";
import { getDb } from "../../../lib/db/connection.ts";
import { AreaQuery, queryArea } from "../../../lib/db/area.ts";

export async function GET(request: NextRequest) {
  const parsed = AreaQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`);
    return Response.json({ error: "invalid query", issues }, { status: 400 });
  }
  const started = performance.now();
  const result = queryArea(getDb(), parsed.data);
  const ms = performance.now() - started;
  return Response.json(result, { headers: { "Server-Timing": `db;dur=${ms.toFixed(1)}` } });
}
