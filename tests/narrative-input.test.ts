import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceText } from "../lib/narrative/input.ts";
import { FeaturedListSchema, type InputItem, type StoryInput } from "../lib/narrative/types.ts";

const item = (ref: string, over: Partial<InputItem> = {}): InputItem => ({
  ref, qid: "Q1", label: "Label", description: "Description", kind: "event", years: "430 BCE to 426 BCE",
  start_year: -430, end_year: -426, loc_confidence: "exact", wikipedia_title: null, extract: "The extract.", ...over,
});
const input: StoryInput = {
  entry: { id: "a", place: "a", from: -500, to: -300, cell: "851eda77fffffff" },
  generatedAt: "t", dbRows: 1, eventsTotal: 2, othersTotal: 0,
  context: { ref: "C", text: "Some context." },
  items: [item("E1"), item("E2", { loc_confidence: "inherited", extract: null })],
};

describe("sourceText", () => {
  it("builds source text per ref", () => {
    expect(sourceText(input, "E1").split("\n")).toEqual(["Label", "Description", "430 BCE to 426 BCE", "The extract."]);
    expect(sourceText(input, "E1")).not.toContain("approximate location");
    expect(sourceText(input, "E2")).toContain("approximate location");
    expect(sourceText(input, "C")).toBe("Some context.");
    expect(() => sourceText(input, "E99")).toThrow();
  });
});

describe("stories/featured.json", () => {
  const list = FeaturedListSchema.parse(JSON.parse(readFileSync("stories/featured.json", "utf8")));
  it("has twenty entries with unique ids, ordered by from", () => {
    expect(list).toHaveLength(20);
    expect(new Set(list.map((e) => e.id)).size).toBe(20);
    expect(list.map((e) => e.from)).toEqual([...list.map((e) => e.from)].sort((a, b) => a - b));
  });
});
