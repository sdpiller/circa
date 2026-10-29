import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AreaResult } from "../lib/db/area.ts";
import type { PublishedStory } from "../lib/narrative/publish.ts";
import { FEATURED, missingCites, storyFor } from "../lib/stories/catalog.ts";

const story = (id: string, cell: string, from: number, to: number, qids: (string | null)[]): PublishedStory => ({
  entry: { id, place: "Somewhere", from, to, cell },
  writtenAt: "2026-10-29",
  writtenBy: "test",
  paragraphs: [[{ text: "Text.", cites: qids.map((qid, i) => ({ ref: qid ? `E${i + 1}` : "C", qid, label: "L" })) }]],
});

const stories = [story("a", "8528308bfffffff", -500, -400, ["Q1", "Q2", null]), story("b", "8528309bfffffff", 100, 200, ["Q3"])];

describe("storyFor", () => {
  it("matches on cell, from and to exactly", () => {
    expect(storyFor("8528308bfffffff", -500, -400, stories)?.entry.id).toBe("a");
  });
  it("returns null when any of the three differs", () => {
    expect(storyFor("8528308bfffffff", -499, -400, stories)).toBeNull();
    expect(storyFor("8528308bfffffff", -500, -401, stories)).toBeNull();
    expect(storyFor("8528309bfffffff", -500, -400, stories)).toBeNull();
  });
  it("defaults to the published catalog", () => {
    expect(storyFor("8528308bfffffff", 1, 2)).toBeNull();
  });
});

describe("missingCites", () => {
  const area = (events: string[], others: string[]) =>
    ({ events: events.map((qid) => ({ qid })), others: others.map((qid) => ({ qid })) }) as unknown as AreaResult;
  it("is empty when every cited qid is present", () => {
    expect(missingCites(stories[0], area(["Q1"], ["Q2"]))).toEqual([]);
  });
  it("lists a cited qid that is absent, and ignores the null one", () => {
    expect(missingCites(stories[0], area(["Q1"], []))).toEqual(["Q2"]);
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
