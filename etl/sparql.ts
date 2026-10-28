import { z } from "zod";

/**
 * Minimal SPARQL-over-HTTP client for the ETL.
 * - One request at a time, with a minimum gap between requests (etiquette).
 * - Retries 429 and 5xx with backoff, honouring Retry-After.
 * - Validates the SPARQL JSON results shape with zod.
 * - Sends WIKIMEDIA_CONTACT in the User-Agent to both endpoints (required by Wikimedia, courtesy to QLever).
 */

export const ENDPOINTS = {
  qlever: "https://qlever.dev/api/wikidata",
  wdqs: "https://query.wikidata.org/sparql",
} as const;
export type EndpointName = keyof typeof ENDPOINTS;

export const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
`;

const Term = z.object({
  type: z.enum(["uri", "literal", "bnode", "typed-literal"]),
  value: z.string(),
  datatype: z.string().optional(),
  "xml:lang": z.string().optional(),
});
export type Term = z.infer<typeof Term>;

export const SparqlResults = z.object({
  head: z.object({ vars: z.array(z.string()) }),
  results: z.object({ bindings: z.array(z.record(z.string(), Term)) }),
  // QLever adds this; WDQS does not.
  meta: z.object({ "result-size-total": z.number().optional() }).passthrough().optional(),
});
export type SparqlResults = z.infer<typeof SparqlResults>;
export type Binding = Record<string, Term>;

const MIN_GAP_MS = 2000;
const MAX_ATTEMPTS = 4;
// QLever is a shared research server: back off much longer there.
const BACKOFF_BASE_MS: Record<EndpointName, number> = { wdqs: 5_000, qlever: 30_000 };
// QLever streams results; if it fails midway it appends this marker to a body that began with HTTP 200.
const QLEVER_STREAM_ERROR = "!!!!>>#";
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RetryableError extends Error {}

/** Wikimedia requires a contact; QLever gets the same one as a courtesy (owner approved 2026-10-28). */
export function userAgent(_endpoint: EndpointName): string {
  const contact = process.env.WIKIMEDIA_CONTACT;
  if (!contact) throw new Error("WIKIMEDIA_CONTACT is required (see .env.example)");
  return `Chronoglobe/0.1 (${contact}) node/${process.version}`;
}

export async function query(endpoint: EndpointName, sparql: string, timeoutMs = 300_000): Promise<SparqlResults> {
  const body = new URLSearchParams({ query: PREFIXES + sparql });
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let retryAfterMs = 0;
    try {
      const res = await fetch(ENDPOINTS[endpoint], {
        method: "POST",
        headers: {
          "User-Agent": userAgent(endpoint),
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) {
        retryAfterMs = Number(res.headers.get("retry-after")) * 1000 || 0;
        const msg = `SPARQL ${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`;
        // 429 covers both rate limiting and, on QLever, server-side query timeouts.
        if (res.status === 429 || res.status >= 500) throw new RetryableError(msg);
        throw new Error(msg);
      }
      if (text.includes(QLEVER_STREAM_ERROR)) {
        throw new RetryableError(`QLever failed mid-stream: ${text.slice(text.indexOf(QLEVER_STREAM_ERROR), 400)}`);
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new RetryableError(`Invalid JSON from ${endpoint} (${text.length} bytes), probably truncated`);
      }
      const parsed = SparqlResults.parse(json);
      const total = parsed.meta?.["result-size-total"];
      if (total !== undefined && total !== parsed.results.bindings.length) {
        throw new Error(`Truncated result: ${parsed.results.bindings.length} of ${total} rows returned`);
      }
      return parsed;
    } catch (err) {
      const retryable = err instanceof RetryableError || (err instanceof Error && err.name === "TimeoutError") || err instanceof TypeError;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
      const wait = Math.max(retryAfterMs, BACKOFF_BASE_MS[endpoint] * 2 ** (attempt - 1));
      console.warn(`  retry ${attempt}/${MAX_ATTEMPTS - 1} in ${Math.round(wait / 1000)} s: ${(err as Error).message.slice(0, 160)}`);
      await sleep(wait);
    }
  }
}
