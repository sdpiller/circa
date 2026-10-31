import { describe, expect, it } from "vitest";
import { placeStory, publishStories, type CitedRow, type Placement } from "../lib/narrative/publish.ts";
import type { FeaturedEntry, FrozenEntry, InputItem, Story, StoryInput } from "../lib/narrative/types.ts";

const entry = (id: string): FeaturedEntry => ({ id, place: id, from: -500, to: -300 });
const frozen = (id: string): FrozenEntry => ({ ...entry(id), cell: "851eda77fffffff" });
const placement: Placement = { point: [23.7, 37.9], provinces: ["GRC+1"] };
const placements = (...ids: string[]) => new Map(ids.map((id) => [id, placement]));
const item: InputItem = {
  ref: "E1", qid: "Q10", label: "Siege of Plataea", kind: "event", description: "a siege", years: "429 BCE to 427 BCE",
  start_year: -429, end_year: -427, loc_confidence: "exact", wikipedia_title: null,
  extract: "The Siege of Plataea lasted from 429 BCE to 427 BCE.",
};
const input = (id: string): StoryInput => ({
  entry: frozen(id), generatedAt: "t", dbRows: 1, eventsTotal: 1, othersTotal: 0,
  context: { ref: "C", text: "This area has 1 documented events." }, items: [item],
});
const LONG =
  "The siege of Plataea ran from 429 BCE to 427 BCE. " +
  "It was a long and grinding siege, and the town held out for a very long time against the besiegers who surrounded it. " +
  "The defenders were few, the walls were strong, and the besiegers settled in for a slow wait that tested everyone involved. " +
  "The record of it is short, but it shows how a small town could hold a large force for years.";
const story = (id: string): Story => ({
  id, rulesVersion: 1, writtenAt: "2026-10-29", writtenBy: "test",
  paragraphs: [[{ text: LONG, cites: ["E1", "C"] }]],
});

describe("publishStories", () => {
  it("maps refs to qid and label, and C to null", () => {
    const out = publishStories([entry("a")], [story("a")], new Map([["a", input("a")]]), placements("a"));
    expect(out).toHaveLength(1);
    expect(out[0]!.paragraphs[0]![0]!.cites).toEqual([
      { ref: "E1", qid: "Q10", label: "Siege of Plataea" },
      { ref: "C", qid: null, label: "this area's lists" },
    ]);
  });

  it("skips featured entries without a story, keeping featured order", () => {
    const out = publishStories(
      [entry("a"), entry("b"), entry("c")],
      [story("c"), story("a")],
      new Map([["a", input("a")], ["c", input("c")]]),
      placements("a", "c"),
    );
    expect(out.map((p) => p.entry.id)).toEqual(["a", "c"]);
  });

  it("throws on a failing story, naming the id and the failure", () => {
    const bad = story("a");
    bad.paragraphs[0]![0]!.cites = [];
    expect(() => publishStories([entry("a")], [bad], new Map([["a", input("a")]]), placements("a"))).toThrow(/a.*uncited/s);
  });

  it("throws when a story has no input, a mismatched input, or is not featured", () => {
    expect(() => publishStories([entry("a")], [story("a")], new Map(), placements("a"))).toThrow(/a/);
    expect(() => publishStories([entry("a")], [story("a")], new Map([["a", input("z")]]), placements("a"))).toThrow("Story a has an input for z");
    expect(() => publishStories([entry("a")], [story("q")], new Map([["q", input("q")]]), placements("q"))).toThrow(/q/);
  });

  it.each([
    ["from", { from: -600 }],
    ["to", { to: -200 }],
  ])("throws when the input was written for a different %s", (field, change) => {
    const bad = { ...input("a"), entry: { ...frozen("a"), ...change } };
    expect(() => publishStories([entry("a")], [story("a")], new Map([["a", bad]]), placements("a"))).toThrow(
      `Story a has an input for a different ${field}`,
    );
  });

  it("does not compare the frozen cell", () => {
    const other = { ...input("a"), entry: { ...frozen("a"), cell: "832ca2fffffffff" } };
    expect(() => publishStories([entry("a")], [story("a")], new Map([["a", other]]), placements("a"))).not.toThrow();
  });

  it("carries point and provinces through", () => {
    const out = publishStories([entry("a")], [story("a")], new Map([["a", input("a")]]), placements("a"));
    expect(out[0]!.point).toEqual([23.7, 37.9]);
    expect(out[0]!.provinces).toEqual(["GRC+1"]);
    expect(out[0]!.entry).toEqual(entry("a"));
  });

  it("throws when a placement is missing", () => {
    expect(() => publishStories([entry("a")], [story("a")], new Map([["a", input("a")]]), new Map())).toThrow(/a.*placement/s);
  });
});

const cr = (qid: string, province_id: string | null, sitelinks: number, lat = 10, lon = 20): CitedRow => ({ qid, lat, lon, sitelinks, province_id });

describe("placeStory", () => {
  it("picks the province with the most cited items, then its most notable item", () => {
    const p = placeStory([cr("Q1", "B", 90, 1, 2), cr("Q2", "A", 5, 3, 4), cr("Q3", "A", 50, 5, 6), cr("Q4", "A", 7, 7, 8)]);
    expect(p).toEqual({ point: [6, 5], provinces: ["A", "B"] });
  });
  it("breaks province ties by the lower code, and item ties by the lower qid", () => {
    expect(placeStory([cr("Q1", "B", 9), cr("Q2", "A", 1, 5, 5)]).point).toEqual([5, 5]);
    expect(placeStory([cr("Q9", "A", 4, 1, 1), cr("Q2", "A", 4, 2, 2)]).point).toEqual([2, 2]);
  });
  it("lists each distinct province once, sorted", () => {
    expect(placeStory([cr("Q1", "C", 1), cr("Q2", "A", 1), cr("Q3", "C", 1), cr("Q4", "B", 1)]).provinces).toEqual(["A", "B", "C"]);
  });
  it("throws, naming the qid, when an item has no province", () => {
    expect(() => placeStory([cr("Q1", "A", 1), cr("Q77", null, 1)])).toThrow(/Q77/);
  });
});
