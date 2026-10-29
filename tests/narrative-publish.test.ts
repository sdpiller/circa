import { describe, expect, it } from "vitest";
import { publishStories } from "../lib/narrative/publish.ts";
import type { FeaturedEntry, InputItem, Story, StoryInput } from "../lib/narrative/types.ts";

const entry = (id: string): FeaturedEntry => ({ id, place: id, from: -500, to: -300, cell: "851eda77fffffff" });
const item: InputItem = {
  ref: "E1", qid: "Q10", label: "Siege of Plataea", kind: "event", description: "a siege", years: "429 BCE to 427 BCE",
  start_year: -429, end_year: -427, loc_confidence: "exact", wikipedia_title: null,
  extract: "The Siege of Plataea lasted from 429 BCE to 427 BCE.",
};
const input = (id: string): StoryInput => ({
  entry: entry(id), generatedAt: "t", dbRows: 1, eventsTotal: 1, othersTotal: 0,
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
    const out = publishStories([entry("a")], [story("a")], new Map([["a", input("a")]]));
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
    );
    expect(out.map((p) => p.entry.id)).toEqual(["a", "c"]);
  });

  it("throws on a failing story, naming the id and the failure", () => {
    const bad = story("a");
    bad.paragraphs[0]![0]!.cites = [];
    expect(() => publishStories([entry("a")], [bad], new Map([["a", input("a")]]))).toThrow(/a.*uncited/s);
  });

  it("throws when a story has no input, a mismatched input, or is not featured", () => {
    expect(() => publishStories([entry("a")], [story("a")], new Map())).toThrow(/a/);
    expect(() => publishStories([entry("a")], [story("a")], new Map([["a", input("z")]]))).toThrow(/a/);
    expect(() => publishStories([entry("a")], [story("q")], new Map([["q", input("q")]]))).toThrow(/q/);
  });
});
