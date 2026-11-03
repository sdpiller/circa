/**
 * GET /api/outline?lat&lon&from&to
 * The outline a click at the point would draw, without the lists: the map previews it under the mouse.
 * `outline` is null where a click selects nothing, which also tells the map the point is not clickable.
 */
import type { NextRequest } from "next/server";
import { getDb } from "../../../lib/db/connection.ts";
import { ANSWER_CACHE, OutlineQuery, queryOutline } from "../../../lib/db/area.ts";

export async function GET(request: NextRequest) {
  const parsed = OutlineQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`);
    return Response.json({ error: "invalid query", issues }, { status: 400 });
  }
  const started = performance.now();
  const result = queryOutline(getDb(), parsed.data);
  const ms = performance.now() - started;
  return Response.json(result, { headers: { "Server-Timing": `db;dur=${ms.toFixed(1)}`, "Cache-Control": ANSWER_CACHE } });
}
