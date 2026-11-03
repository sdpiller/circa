/**
 * English Wikipedia page summaries: fetch, validate, cache.
 * Text is plain text only (extract, never extract_html). A thumbnail is kept only when it is
 * hosted on Commons, which holds only freely licensed files.
 */
import type Database from "better-sqlite3";
import { z } from "zod";

export type Summary = {
  title: string;
  description: string | null;
  extract: string;
  thumbnail: { source: string; width: number; height: number } | null;
  url: string;
};

export type SummaryResult = { status: "ok"; summary: Summary } | { status: "missing" };

export type SummaryCache = {
  get(title: string): SummaryResult | undefined;
  put(title: string, value: Summary | "missing"): void;
};

const RawSummary = z.object({
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  extract: z.string(),
  thumbnail: z.object({ source: z.string(), width: z.number(), height: z.number() }).optional(),
  content_urls: z.object({ desktop: z.object({ page: z.string() }) }),
});

export function summaryUrl(title: string): string {
  return "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replaceAll(" ", "_"));
}

export function parseSummary(json: unknown): Summary | "missing" {
  const parsed = RawSummary.safeParse(json);
  if (!parsed.success) throw new Error(`Unexpected summary shape: ${parsed.error.message}`);
  const raw = parsed.data;
  if (raw.type === "disambiguation" || raw.extract.trim() === "") return "missing";
  const thumb = raw.thumbnail && raw.thumbnail.source.includes("/wikipedia/commons/") ? raw.thumbnail : null;
  return {
    title: raw.title,
    description: raw.description ?? null,
    extract: raw.extract,
    thumbnail: thumb,
    url: raw.content_urls.desktop.page,
  };
}

const inFlight = new Map<string, Promise<SummaryResult | { status: "error"; reason: string }>>();

export async function getSummary(
  title: string,
  deps: { cache: SummaryCache; fetch: typeof fetch; contact: string | undefined },
): Promise<SummaryResult | { status: "error"; reason: string }> {
  const hit = deps.cache.get(title);
  if (hit) return hit;
  if (!deps.contact) return { status: "error", reason: "WIKIMEDIA_CONTACT is not set" };

  const pending = inFlight.get(title);
  if (pending) return pending;

  const contact = deps.contact;
  const run = (async () => {
    try {
      const res = await deps.fetch(summaryUrl(title), {
        headers: { "User-Agent": `Circa/0.1 (${contact})`, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 404) {
        deps.cache.put(title, "missing");
        return { status: "missing" } as const;
      }
      if (!res.ok) return { status: "error", reason: `Wikipedia returned ${res.status}` } as const;
      const parsed = parseSummary(await res.json());
      deps.cache.put(title, parsed);
      return parsed === "missing" ? ({ status: "missing" } as const) : ({ status: "ok", summary: parsed } as const);
    } catch (err) {
      return { status: "error", reason: (err as Error).message } as const;
    } finally {
      inFlight.delete(title);
    }
  })();
  inFlight.set(title, run);
  return run;
}

const Qid = z.string().regex(/^Q\d+$/);
/** A day in the browser and in Vercel's CDN, shared by every visitor. Failures carry no cache header. */
const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400, s-maxage=86400" };

/**
 * GET /api/summary?qid=Q123, as a testable function. The title comes from the events database, never
 * from the request, so the route cannot be used to fetch (or cache) arbitrary pages under our contact.
 * 200 Summary, 400 bad qid, 404 { missing: true } (unknown item, no English title, or no article),
 * 502 upstream failure (generic message), 503 when WIKIMEDIA_CONTACT is unset.
 */
export async function summaryResponse(
  qid: string | null,
  deps: { db: Database.Database; cache: SummaryCache; fetch: typeof fetch; contact: string | undefined },
): Promise<Response> {
  const parsed = Qid.safeParse(qid);
  if (!parsed.success) return Response.json({ error: "qid must look like Q123" }, { status: 400 });
  if (!deps.contact) return Response.json({ error: "WIKIMEDIA_CONTACT is not set" }, { status: 503 });

  const found = deps.db.prepare("SELECT wikipedia_title FROM events WHERE qid = ?").get(parsed.data) as
    | { wikipedia_title: string | null }
    | undefined;
  const title = found?.wikipedia_title;
  if (!title) return Response.json({ missing: true }, { status: 404, headers: CACHE_HEADERS });

  const result = await getSummary(title, { cache: deps.cache, fetch: deps.fetch, contact: deps.contact });
  if (result.status === "ok") return Response.json(result.summary, { headers: CACHE_HEADERS });
  if (result.status === "missing") return Response.json({ missing: true }, { status: 404, headers: CACHE_HEADERS });
  console.error(`/api/summary ${parsed.data} (${title}): ${result.reason}`);
  return Response.json({ error: "Could not load from Wikipedia" }, { status: 502 });
}
