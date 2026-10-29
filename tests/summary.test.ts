import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { sqliteSummaryCache } from "../lib/db/cache.ts";
import { getSummary, parseSummary, summaryResponse, summaryUrl, type Summary, type SummaryCache } from "../lib/wiki/summary.ts";
import { makeDb, row } from "./helpers.ts";

const load = (name: string) => JSON.parse(readFileSync(`tests/fixtures/wikipedia/${name}`, "utf8"));
const marathon = load("summary-battle-of-marathon.json");
const disambiguation = load("summary-disambiguation.json");

function memoryCache(): SummaryCache & { store: Map<string, Summary | "missing"> } {
  const store = new Map<string, Summary | "missing">();
  return {
    store,
    get(title) {
      const v = store.get(title);
      if (v === undefined) return undefined;
      return v === "missing" ? { status: "missing" } : { status: "ok", summary: v };
    },
    put(title, value) {
      store.set(title, value);
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("parseSummary", () => {
  it("parses a standard page and keeps a Commons thumbnail", () => {
    const s = parseSummary(marathon) as Summary;
    expect(s.title).toBe("Battle of Marathon");
    expect(s.extract.startsWith("The Battle of Marathon took place")).toBe(true);
    expect(s.thumbnail?.source).toContain("/wikipedia/commons/");
    expect(s.url).toBe("https://en.wikipedia.org/wiki/Battle_of_Marathon");
  });
  it("drops a thumbnail that is not on Commons", () => {
    const edited = structuredClone(marathon);
    edited.thumbnail.source = "https://upload.wikimedia.org/wikipedia/en/thumb/a/a1/X.jpg/330px-X.jpg";
    expect((parseSummary(edited) as Summary).thumbnail).toBeNull();
  });
  it("treats a disambiguation page as missing", () => {
    expect(parseSummary(disambiguation)).toBe("missing");
  });
  it("treats an empty extract as missing", () => {
    expect(parseSummary({ ...marathon, extract: "" })).toBe("missing");
  });
});

describe("summaryUrl", () => {
  it("encodes titles", () => {
    expect(summaryUrl("AC/DC").endsWith("/page/summary/AC%2FDC")).toBe(true);
    expect(summaryUrl("Ségou Empire").endsWith("/page/summary/S%C3%A9gou_Empire")).toBe(true);
    expect(summaryUrl("What?").endsWith("/page/summary/What%3F")).toBe(true);
  });
});

describe("getSummary", () => {
  const contact = "me@example.com";

  it("serves a cache hit without fetching", async () => {
    const cache = memoryCache();
    cache.put("Hit", parseSummary(marathon) as Summary);
    const fetchFn = vi.fn();
    const r = await getSummary("Hit", { cache, fetch: fetchFn as unknown as typeof fetch, contact });
    expect(r.status).toBe("ok");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("parses and stores a 200, sending the User-Agent", async () => {
    const cache = memoryCache();
    const fetchFn = vi.fn(async () => json(marathon));
    const r = await getSummary("Battle of Marathon", { cache, fetch: fetchFn as unknown as typeof fetch, contact });
    expect(r.status).toBe("ok");
    expect(cache.store.get("Battle of Marathon")).toMatchObject({ title: "Battle of Marathon" });
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Chronoglobe/0.1 (me@example.com)");
  });

  it("stores missing for a 404", async () => {
    const cache = memoryCache();
    const fetchFn = vi.fn(async () => json({ status: 404, type: "Internal error" }, 404));
    const r = await getSummary("Nope", { cache, fetch: fetchFn as unknown as typeof fetch, contact });
    expect(r.status).toBe("missing");
    expect(cache.store.get("Nope")).toBe("missing");
  });

  it("stores missing for a disambiguation page", async () => {
    const cache = memoryCache();
    const fetchFn = vi.fn(async () => json(disambiguation));
    const r = await getSummary("Mercury", { cache, fetch: fetchFn as unknown as typeof fetch, contact });
    expect(r.status).toBe("missing");
    expect(cache.store.get("Mercury")).toBe("missing");
  });

  it.each([
    ["network error", () => Promise.reject(new Error("boom"))],
    ["429", async () => json({}, 429)],
    ["500", async () => json({}, 500)],
  ])("returns error and stores nothing on %s", async (_name, impl) => {
    const cache = memoryCache();
    const r = await getSummary("Flaky", { cache, fetch: vi.fn(impl) as unknown as typeof fetch, contact });
    expect(r.status).toBe("error");
    expect(cache.store.size).toBe(0);
  });

  it("returns error without fetching when contact is unset", async () => {
    const fetchFn = vi.fn();
    const r = await getSummary("X", { cache: memoryCache(), fetch: fetchFn as unknown as typeof fetch, contact: undefined });
    expect(r.status).toBe("error");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("shares one in-flight request for concurrent calls", async () => {
    const fetchFn = vi.fn(async () => json(marathon));
    const deps = { cache: memoryCache(), fetch: fetchFn as unknown as typeof fetch, contact };
    await Promise.all([getSummary("Same", deps), getSummary("Same", deps)]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("sqliteSummaryCache", () => {
  const DAY = 86_400_000;
  it("round-trips ok and missing entries", () => {
    const cache = sqliteSummaryCache(new Database(":memory:"));
    const s = parseSummary(marathon) as Summary;
    cache.put("A", s);
    cache.put("B", "missing");
    expect(cache.get("A")).toEqual({ status: "ok", summary: s });
    expect(cache.get("B")).toEqual({ status: "missing" });
    expect(cache.get("C")).toBeUndefined();
  });
  it("expires ok after 30 days and missing after 7", () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const cache = sqliteSummaryCache(new Database(":memory:"), () => now);
    cache.put("A", parseSummary(marathon) as Summary);
    cache.put("B", "missing");
    now += 8 * DAY;
    expect(cache.get("A")?.status).toBe("ok");
    expect(cache.get("B")).toBeUndefined();
    now += 23 * DAY;
    expect(cache.get("A")).toBeUndefined();
  });
});

describe("summaryResponse (GET /api/summary)", () => {
  const contact = "me@example.com";
  const db = makeDb([
    row({ qid: "Q31900", wikipedia_title: "Battle of Marathon" }),
    row({ qid: "Q777", wikipedia_title: null }),
  ]);
  const deps = (fetchFn: ReturnType<typeof vi.fn>, over: { contact?: string | undefined } = {}) => ({
    db,
    cache: memoryCache(),
    fetch: fetchFn as unknown as typeof fetch,
    contact: "contact" in over ? over.contact : contact,
  });

  it.each([[null], [""], ["Battle of Marathon"], ["Q"], ["q31900"], ["Q31900x"], ["../../x"]])(
    "rejects qid %j with 400 and no fetch",
    async (qid) => {
      const fetchFn = vi.fn();
      const res = await summaryResponse(qid, deps(fetchFn));
      expect(res.status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it("answers 404 missing with no fetch for an unknown qid", async () => {
    const fetchFn = vi.fn();
    const res = await summaryResponse("Q999999", deps(fetchFn));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ missing: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("answers 404 missing with no fetch for an item without a Wikipedia title", async () => {
    const fetchFn = vi.fn();
    const res = await summaryResponse("Q777", deps(fetchFn));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ missing: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("answers 503 with no fetch when WIKIMEDIA_CONTACT is unset", async () => {
    const fetchFn = vi.fn();
    const res = await summaryResponse("Q31900", deps(fetchFn, { contact: undefined }));
    expect(res.status).toBe(503);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetches the stored title and caches it under that title", async () => {
    const fetchFn = vi.fn(async () => json(marathon));
    const d = deps(fetchFn);
    const res = await summaryResponse("Q31900", d);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Summary).title).toBe("Battle of Marathon");
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(summaryUrl("Battle of Marathon"));
    expect(d.cache.store.has("Battle of Marathon")).toBe(true);
  });

  it("answers 502 with a generic message, never the upstream error text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = vi.fn(() => Promise.reject(new Error("secret internal detail")));
    const res = await summaryResponse("Q31900", deps(fetchFn));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
    expect(log).toHaveBeenCalledOnce(); // the detail goes to the server log instead
    log.mockRestore();
  });
});
