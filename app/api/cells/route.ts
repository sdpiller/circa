/**
 * GET /api/cells?west&south&east&north&from&to&zoom
 * Item and event counts per H3 cell for the visible box and year range.
 * Server-Timing reports the database time.
 */
import type { NextRequest } from "next/server";
import { getDb } from "../../../lib/db/connection.ts";
import { CellsQuery, queryCells } from "../../../lib/db/cells.ts";

export async function GET(request: NextRequest) {
  const parsed = CellsQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`);
    return Response.json({ error: "invalid query", issues }, { status: 400 });
  }
  const started = performance.now();
  const result = queryCells(getDb(), parsed.data);
  const ms = performance.now() - started;
  return Response.json(result, { headers: { "Server-Timing": `db;dur=${ms.toFixed(1)}` } });
}
