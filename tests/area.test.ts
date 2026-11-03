import { beforeEach, describe, expect, it } from "vitest";
import { AreaQuery, OutlineQuery, queryArea, queryOutline, type AreaAnswer, type AreaQueryInput } from "../lib/db/area.ts";
import { pointInGeometry } from "../lib/geo/geometry.ts";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { box, makeGeoDb, province, region, resetRowCounter, row, story } from "./helpers.ts";

beforeEach(resetRowCounter);

const provinces = () => [province("IN", box(0, 0, 1, 1)), province("NEXT", box(1, 0, 2, 1)), province("OUT", box(0, 1, 1, 2), { country: "Elsewhere" })];
const regions = () => [region("basemaps", "Atlas", -3500, 2026, box(0, 0, 2, 1))];
const IN = { lat: 0.5, lon: 0.5 };
const NEXT = { lat: 0.5, lon: 1.5 };
const OUT = { lat: 1.5, lon: 0.5 };
const q: AreaQueryInput = { ...IN, from: -500, to: -300, intent: "click", eventsLimit: 25, othersLimit: 30 };
const at = (year: number, over = {}) => row({ ...IN, start_year: year, end_year: year, ...over });

function run(rows = [at(-400)], over: Partial<AreaQueryInput> = {}, stories: readonly PublishedStory[] = []): AreaAnswer {
  return queryArea(makeGeoDb(rows, provinces(), regions()), { ...q, ...over }, stories);
}

describe("queryArea: the click", () => {
  it("names the region and lists its items", () => {
    const r = run();
    expect(r.selection).toMatchObject({ kind: "historical", name: "Atlas" });
    expect(r.eventsTotal).toBe(1);
    expect(r.storyId).toBeNull();
    expect([r.from, r.to]).toEqual([-500, -300]);
  });

  it("gives every point of one province the same outline", () => {
    expect(run([], { lat: 0.1, lon: 0.9 }).selection).toEqual(run().selection);
  });

  it("a click 40 km off the coast counts as the nearest province", () => {
    const r = run([at(-400)], { lat: -0.36, lon: 0.5 });
    expect(r.selection).toMatchObject({ kind: "historical", name: "Atlas" });
    expect(r.eventsTotal).toBe(1);
  });

  it("a click 60 km off the coast is nothing, with empty lists and the range unchanged", () => {
    const r = run([at(-400)], { lat: -0.54, lon: 0.5 });
    expect(r).toEqual({ selection: { kind: "none" }, storyId: null, from: -500, to: -300, events: [], eventsTotal: 0, others: [], othersTotal: 0 });
  });
});

describe("queryArea: stories", () => {
  const athens = () => story("athens", ["IN"], -500, -300);

  it("a click in a story's province at an overlapping range opens it and moves the range", () => {
    const r = run([at(-400)], { from: -450, to: -350 }, [athens()]);
    expect(r.storyId).toBe("athens");
    expect([r.from, r.to]).toEqual([-500, -300]);
  });

  it("a range at the same years shows no story and leaves the range alone", () => {
    const r = run([at(-400)], { from: -450, to: -350, intent: "range" }, [athens()]);
    expect(r.storyId).toBeNull();
    expect([r.from, r.to]).toEqual([-450, -350]);
  });

  it("a range at the exact years shows the story", () => {
    expect(run([at(-400)], { intent: "range" }, [athens()]).storyId).toBe("athens");
  });

  it("a click outside the story's provinces does not open it", () => {
    expect(run([at(-400)], NEXT, [athens()]).storyId).toBeNull();
  });

  it("lists items by the story's years once the range has moved", () => {
    const r = run([at(-490), at(-400)], { from: -450, to: -350 }, [athens()]);
    expect(r.eventsTotal).toBe(2);
  });
});

describe("queryArea: the lists", () => {
  it("holds only items in the outline's provinces that overlap the range", () => {
    const r = run([
      at(-400, { label: "here" }),
      at(-400, { ...NEXT, label: "next door" }),
      at(-400, { ...OUT, label: "other country" }),
      at(-100, { label: "too late" }),
      row({ ...IN, start_year: -600, end_year: -500, label: "overlaps at the edge" }),
    ]);
    expect(r.events.map((e) => e.label).sort()).toEqual(["here", "next door", "overlaps at the edge"]);
    expect(r.eventsTotal).toBe(3);
  });

  it("applies limits, keeps full totals, and takes the most notable", () => {
    const r = run(
      [at(-300, { sitelinks: 50, label: "late" }), at(-500, { sitelinks: 10, label: "early low" }), at(-500, { sitelinks: 20, label: "early high" }), at(-400, { sitelinks: 1, label: "dropped" })],
      { eventsLimit: 3 },
    );
    expect(r.events.map((e) => e.label)).toEqual(["early high", "early low", "late"]);
    expect(r.eventsTotal).toBe(4);
  });

  it("sorts others by sitelinks and counts them all", () => {
    const r = run([at(-400, { kind: "birth", sitelinks: 5 }), at(-400, { kind: "founding", sitelinks: 9 }), at(-400, { kind: "structure", sitelinks: 7 })], { othersLimit: 2 });
    expect(r.others.map((o) => o.sitelinks)).toEqual([9, 7]);
    expect(r.othersTotal).toBe(3);
    expect(r.events).toEqual([]);
  });

  it("puts discoveries with events and the rest in others", () => {
    const r = run(["event", "discovery", "birth", "founding", "structure"].map((kind) => at(-400, { kind })));
    expect(r.events.map((e) => e.kind).sort()).toEqual(["discovery", "event"]);
    expect(r.others.map((e) => e.kind).sort()).toEqual(["birth", "founding", "structure"]);
  });

  it("breaks sitelink ties by qid", () => {
    const r = run([at(-400, { qid: "Q20", sitelinks: 1 }), at(-400, { qid: "Q3", sitelinks: 1 })]);
    expect(r.events.map((e) => e.qid)).toEqual(["Q20", "Q3"]);
  });

  it("appends a cited item outside the top N, in the sort order, without duplicating", () => {
    const rows = [at(-450, { qid: "Q100", sitelinks: 9 }), at(-440, { qid: "Q101", sitelinks: 8 }), at(-490, { qid: "Q102", sitelinks: 1 }), at(-400, { qid: "Q103", kind: "birth", sitelinks: 1 }), at(-400, { qid: "Q104", kind: "birth", sitelinks: 7 })];
    const s = story("athens", ["IN"], -500, -300, ["Q100", "Q102", "Q103"]);
    const r = run(rows, { eventsLimit: 1, othersLimit: 1 }, [s]);
    expect(r.events.map((e) => e.qid)).toEqual(["Q102", "Q100"]);
    expect(r.eventsTotal).toBe(3);
    expect(r.others.map((e) => e.qid)).toEqual(["Q104", "Q103"]);
    expect(r.othersTotal).toBe(2);
  });

  it("a cited qid absent from the database is simply absent", () => {
    const r = run([at(-400, { qid: "Q100" })], {}, [story("athens", ["IN"], -500, -300, ["Q100", "Q999"])]);
    expect(r.events.map((e) => e.qid)).toEqual(["Q100"]);
  });

  it("an item with no province is never listed, even when cited", () => {
    const nowhere = at(-400, { qid: "Q200", lat: -40, lon: 100 }); // past the loader's snap distance
    const r = run([nowhere, at(-400, { qid: "Q100" })], {}, [story("athens", ["IN"], -500, -300, ["Q200"])]);
    expect(r.events.map((e) => e.qid)).toEqual(["Q100"]);
    expect(r.eventsTotal).toBe(1);
  });
});

describe("queryOutline: the hover", () => {
  const hover = (over: Partial<AreaQueryInput> = {}, stories: readonly PublishedStory[] = []) => {
    const { lat, lon, from, to } = { ...q, ...over };
    return queryOutline(makeGeoDb([], provinces(), regions()), { lat, lon, from, to }, stories).outline;
  };
  const shapeOf = (h: ReturnType<typeof hover>) => h && { fill: h.fill, lines: h.lines };
  const clickShape = (over: Partial<AreaQueryInput> = {}, stories: readonly PublishedStory[] = []) => {
    const s = run([], over, stories).selection;
    return s.kind === "none" ? null : { fill: s.fill, lines: s.lines };
  };

  it("previews the outline a click at the same point gets", () => {
    expect(hover()).not.toBeNull();
    expect(shapeOf(hover())).toEqual(clickShape());
  });

  it("says where in the province it holds, so the browser can reuse it there", () => {
    const h = hover()!.holds!;
    expect(h.id).toBe("IN/0");
    expect(pointInGeometry(0.9, 0.1, h.shape)).toBe(true);
    expect(pointInGeometry(1.5, 0.5, h.shape)).toBe(false);
  });

  it("previews a story's outline where a click would open the story", () => {
    const wide = [story("athens", ["IN", "OUT"], -500, -300)];
    const shape = shapeOf(hover({ from: -450, to: -350 }, wide));
    expect(shape).toEqual(clickShape({ from: -450, to: -350 }, wide));
    expect(shape).not.toEqual(shapeOf(hover({ from: -450, to: -350 })));
  });

  it("is null where a click selects nothing", () => {
    expect(hover({ lat: -0.54, lon: 0.5 })).toBeNull();
  });
});

describe("OutlineQuery", () => {
  const good = { lat: "38", lon: "23.7", from: "-500", to: "-300" };
  const fails = (over: object) => OutlineQuery.safeParse({ ...good, ...over }).success === false;

  it("parses strings to numbers", () => {
    expect(OutlineQuery.parse(good)).toEqual({ lat: 38, lon: 23.7, from: -500, to: -300 });
  });
  it("rejects year 0, from after to, and a point off the globe", () => {
    expect(fails({ from: "0" })).toBe(true);
    expect(fails({ from: "-300", to: "-500" })).toBe(true);
    expect(fails({ lon: "181" })).toBe(true);
  });
});

describe("AreaQuery", () => {
  const good = { lat: "38", lon: "23.7", from: "-500", to: "-300", intent: "click" };
  const fails = (over: object) => AreaQuery.safeParse({ ...good, ...over }).success === false;

  it("parses strings to numbers and fills in the default limits", () => {
    expect(AreaQuery.parse(good)).toEqual({ lat: 38, lon: 23.7, from: -500, to: -300, intent: "click", eventsLimit: 25, othersLimit: 30 });
  });
  it("takes limits", () => {
    expect(AreaQuery.parse({ ...good, eventsLimit: "50", othersLimit: "60" })).toMatchObject({ eventsLimit: 50, othersLimit: 60 });
  });
  it("rejects year 0", () => {
    expect(fails({ from: "0" })).toBe(true);
    expect(fails({ to: "0" })).toBe(true);
  });
  it("rejects from after to", () => {
    expect(fails({ from: "-300", to: "-500" })).toBe(true);
  });
  it("rejects a latitude or longitude off the globe", () => {
    expect(fails({ lat: "91" })).toBe(true);
    expect(fails({ lon: "181" })).toBe(true);
  });
  it("rejects an unknown or missing intent", () => {
    expect(fails({ intent: "hover" })).toBe(true);
    expect(fails({ intent: undefined })).toBe(true);
  });
  it("rejects a limit out of bounds and an empty number", () => {
    expect(fails({ eventsLimit: "0" })).toBe(true);
    expect(fails({ othersLimit: "201" })).toBe(true);
    expect(fails({ lat: "" })).toBe(true);
  });
});
