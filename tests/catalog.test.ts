import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AreaItem } from "../lib/db/area.ts";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { FEATURED, missingCites, storyFor } from "../lib/stories/catalog.ts";

const story = (id: string, provinces: string[], from: number, to: number, qids: (string | null)[]): PublishedStory => ({
  entry: { id, place: "Somewhere", from, to },
  point: [0, 0],
  provinces,
  writtenAt: "2026-10-29",
  writtenBy: "test",
  paragraphs: [[{ text: "Text.", cites: qids.map((qid, i) => ({ ref: qid ? `E${i + 1}` : "C", qid, label: "L" })) }]],
});

const athens = story("athens", ["A"], -500, -300, ["Q1", "Q2", null]);
const babylon = story("babylon", ["B", "C", "D"], -2500, -500, ["Q3"]);
const baghdad = story("baghdad", ["C", "D"], 750, 1260, ["Q4"]);
const stories = [athens, babylon, baghdad];
const id = (s: PublishedStory | null) => s?.entry.id ?? null;

describe("storyFor on a click", () => {
  const click = (province: string, from: number, to: number) => id(storyFor(province, from, to, "click", stories));
  it("opens the story when the range is inside the story's years", () => {
    expect(click("A", -450, -350)).toBe("athens");
  });
  it("is null when the years do not overlap", () => {
    expect(click("A", 1000, 1100)).toBeNull();
  });
  it("opens it when the overlap is half the story's years", () => {
    expect(click("A", -3500, 2026)).toBe("athens");
  });
  it("opens it when the overlap is half the chosen range", () => {
    expect(click("A", -400, -200)).toBe("athens");
  });
  it("is null when the overlap is under half of both", () => {
    expect(click("A", -310, 1000)).toBeNull();
  });
  it("takes the story with the smaller set of provinces on a very wide range", () => {
    expect(click("C", -3500, 2026)).toBe("baghdad");
  });
  it("is null for a province no story holds", () => {
    expect(click("Z", -500, -300)).toBeNull();
  });
});

describe("storyFor from the range", () => {
  const range = (province: string, from: number, to: number) => id(storyFor(province, from, to, "range", stories));
  it("matches the exact years only", () => {
    expect(range("A", -500, -300)).toBe("athens");
    expect(range("A", -500, -299)).toBeNull();
    expect(range("A", -450, -350)).toBeNull();
  });
  it("needs the province", () => {
    expect(range("Z", -500, -300)).toBeNull();
  });
});

describe("storyFor defaults", () => {
  it("uses the published catalog", () => {
    expect(storyFor("nowhere", 1, 2, "click")).toBeNull();
  });
});

describe("missingCites", () => {
  const area = (events: string[], others: string[]) => ({
    events: events.map((qid) => ({ qid }) as AreaItem),
    others: others.map((qid) => ({ qid }) as AreaItem),
  });
  it("is empty when every cited qid is present", () => {
    expect(missingCites(athens, area(["Q1"], ["Q2"]))).toEqual([]);
  });
  it("lists a cited qid that is absent, and ignores the null one", () => {
    expect(missingCites(athens, area(["Q1"], []))).toEqual(["Q2"]);
  });
});

describe("FEATURED", () => {
  it("is ordered by from", () => {
    const froms = FEATURED.map((e) => e.from);
    expect(froms).toEqual([...froms].sort((x, y) => x - y));
  });
});

describe("inputs guard", () => {
  it("no app or lib file mentions stories/inputs", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && readFileSync(p, "utf8").includes("stories/inputs")) hits.push(p);
      }
    };
    walk("app");
    walk("lib");
    expect(hits).toEqual([]);
  });
});
