import { describe, expect, it } from "vitest";
import { AREA_LIMIT_MAX, EVENTS_STEP, OTHERS_STEP, areaUrl, cardPlacement, firstSentences, moreControl, panToClear, summaryApiUrl, wikidataUrl } from "../lib/box.ts";
import { what } from "../lib/dots.ts";

describe("areaUrl", () => {
  it("builds the area query with limits", () => {
    expect(areaUrl({ cell: "851ec9a3fffffff", from: -500, to: -300, eventsLimit: 25, othersLimit: 30 })).toBe(
      "/api/area?cell=851ec9a3fffffff&from=-500&to=-300&eventsLimit=25&othersLimit=30",
    );
  });

  it("adds the focus item when there is one", () => {
    expect(areaUrl({ cell: "851ec9a3fffffff", from: 1, to: 2026, eventsLimit: 50, othersLimit: 30, focus: "Q123" })).toBe(
      "/api/area?cell=851ec9a3fffffff&from=1&to=2026&eventsLimit=50&othersLimit=30&focus=Q123",
    );
  });

  it("uses the default steps and cap from the global constraints", () => {
    expect([EVENTS_STEP, OTHERS_STEP, AREA_LIMIT_MAX]).toEqual([25, 30, 200]);
  });
});

describe("summaryApiUrl and wikidataUrl", () => {
  it("encodes the title", () => {
    expect(summaryApiUrl("Battle of Marathon")).toBe("/api/summary?title=Battle+of+Marathon");
    expect(summaryApiUrl("AC/DC & Co?")).toBe("/api/summary?title=AC%2FDC+%26+Co%3F");
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
    // the focus item can come on top of the limit
    expect(moreControl(26, 26, 25, 25)).toBeNull();
  });

  it("counts a focus item appended past the limit", () => {
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

describe("panToClear", () => {
  it("pans a point under the panel just far enough to sit the margin left of it", () => {
    expect(panToClear(1100, 988, 24)).toBe(136);
    expect(panToClear(965, 988, 24)).toBe(1);
  });

  it("leaves a point that is already clear", () => {
    expect(panToClear(964, 988, 24)).toBe(0);
    expect(panToClear(200, 988, 24)).toBe(0);
  });

  it("does nothing when the panel leaves no room", () => {
    expect(panToClear(300, 10, 24)).toBe(0);
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
