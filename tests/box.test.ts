import { describe, expect, it } from "vitest";
import { AREA_LIMIT_MAX, EVENTS_STEP, OTHERS_STEP, areaUrl, cardPlacement, firstSentences, moreControl, summaryApiUrl, wikidataUrl } from "../lib/box.ts";
import { itemMeta, what } from "../lib/items.ts";

describe("areaUrl", () => {
  it("builds the area query from a point, a range, an intent and limits", () => {
    expect(areaUrl({ lat: 37.98, lon: 23.72, from: -500, to: -300, intent: "click", eventsLimit: 25, othersLimit: 30 })).toBe(
      "/api/area?lat=37.98&lon=23.72&from=-500&to=-300&intent=click&eventsLimit=25&othersLimit=30",
    );
  });

  it("uses the default steps and cap from the global constraints", () => {
    expect([EVENTS_STEP, OTHERS_STEP, AREA_LIMIT_MAX]).toEqual([25, 30, 200]);
  });
});

describe("summaryApiUrl and wikidataUrl", () => {
  it("asks for a summary by Wikidata item, never by title", () => {
    expect(summaryApiUrl("Q31900")).toBe("/api/summary?qid=Q31900");
  });

  it("links a Wikidata item", () => {
    expect(wikidataUrl("Q48314")).toBe("https://www.wikidata.org/wiki/Q48314");
  });
});

describe("firstSentences", () => {
  it("keeps the first two sentences", () => {
    expect(firstSentences("One is here. Two is there! Three is gone? Four.")).toBe("One is here. Two is there!");
  });

  it("returns short text unchanged, trimmed", () => {
    expect(firstSentences("  Only one sentence.  ")).toBe("Only one sentence.");
    expect(firstSentences("No full stop at all")).toBe("No full stop at all");
  });

  it("does not split after abbreviations, initials, or numbers", () => {
    const text =
      "Pericles (c. 495 – 429 BC) was a Greek statesman. He led Athens during the Golden Age, e.g. the Parthenon. He died of plague.";
    expect(firstSentences(text)).toBe("Pericles (c. 495 – 429 BC) was a Greek statesman. He led Athens during the Golden Age, e.g. the Parthenon.");
    expect(firstSentences("John F. Kennedy was born in Brookline. St. Paul visited. Later on.")).toBe(
      "John F. Kennedy was born in Brookline. St. Paul visited.",
    );
    expect(firstSentences("It was built in 432 B.C. by the Athenians. It stands. It is old.")).toBe(
      "It was built in 432 B.C. by the Athenians. It stands.",
    );
  });

  it("splits before a quotation or bracket that opens a sentence", () => {
    expect(firstSentences('A happened. "B" happened. C happened.')).toBe('A happened. "B" happened.');
  });
});

describe("moreControl", () => {
  it("offers a step more while under the cap", () => {
    expect(moreControl(25, 100, 25, 25)).toEqual({ kind: "button", n: 25, next: 50 });
  });

  it("offers only what is left", () => {
    expect(moreControl(25, 31, 25, 25)).toEqual({ kind: "button", n: 6, next: 50 });
  });

  it("stops at the cap and only states the rest", () => {
    expect(moreControl(175, 400, 175, 25)).toEqual({ kind: "button", n: 25, next: 200 });
    expect(moreControl(190, 400, 190, 30)).toEqual({ kind: "button", n: 10, next: 200 });
    expect(moreControl(200, 400, 200, 25)).toEqual({ kind: "text", n: 200 });
  });

  it("returns null when everything is shown", () => {
    expect(moreControl(12, 12, 25, 25)).toBeNull();
    // cited items can come on top of the limit
    expect(moreControl(26, 26, 25, 25)).toBeNull();
  });

  it("counts a cited item appended past the limit", () => {
    expect(moreControl(26, 27, 25, 25)).toEqual({ kind: "button", n: 1, next: 50 });
  });
});

describe("what", () => {
  it("names the kind lines of people and places", () => {
    expect(what({ kind: "birth", category: "other" })).toBe("born here");
    expect(what({ kind: "structure", category: "other" })).toBe("dated");
    expect(what({ kind: "founding", category: "founding" })).toBe("founded");
    expect(what({ kind: "discovery", category: "science" })).toBe("discovered here");
  });
});

describe("itemMeta", () => {
  it("joins years, what and the approximate note with a middle dot", () => {
    expect(itemMeta({ years: "490 BCE", what: "conflict", approx: true })).toBe("490 BCE · conflict · approximate location");
  });
  it("leaves out the approximate note when the location is exact", () => {
    expect(itemMeta({ years: "490 BCE", what: "conflict", approx: false })).toBe("490 BCE · conflict");
  });
});

describe("cardPlacement", () => {
  const box = { top: 16, bottom: 500, left: 1000, width: 360 };
  const list = { top: 300, bottom: 400, left: 1016, width: 328 };
  const name = (top: number) => ({ top, bottom: top + 25, left: 1100, width: 60 });

  it("opens below the name, across the list, when the viewport has room", () => {
    expect(cardPlacement(name(300), box, list, 900)).toEqual({ left: 16, width: 328, top: 309 });
  });

  it("opens above when there is too little room below and more above", () => {
    expect(cardPlacement(name(750), box, list, 900)).toEqual({ left: 16, width: 328, bottom: -250 });
  });

  it("stays below when below is short but above is shorter", () => {
    expect(cardPlacement(name(100), box, list, 300)).toEqual({ left: 16, width: 328, top: 109 });
  });
});
