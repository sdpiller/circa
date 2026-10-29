/**
 * GET /api/events?west&south&east&north&from&to&zoom
 * Dots for the visible bounding box and year range, capped per kind by zoom band.
 * Server-Timing reports the database time, for tuning in the browser's network panel.
 */
import type { NextRequest } from "next/server";
import { getDb } from "../../../lib/db/connection.ts";
import { EventsQuery, queryEvents } from "../../../lib/db/events.ts";

export async function GET(request: NextRequest) {
  const parsed = EventsQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`);
    return Response.json({ error: "invalid query", issues }, { status: 400 });
  }
  const started = performance.now();
  const result = queryEvents(getDb(), parsed.data);
  const ms = performance.now() - started;
  return Response.json(result, { headers: { "Server-Timing": `db;dur=${ms.toFixed(1)}` } });
}
