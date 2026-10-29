import { describe, expect, it } from "vitest";
import { ALLOWLIST } from "../lib/narrative/allowlist.ts";
import { checkStory } from "../lib/narrative/check.ts";
import type { InputItem, Sentence, StoryInput } from "../lib/narrative/types.ts";

const EM = "\u2014";
const EN = "\u2013";

function item(p: Partial<InputItem> & Pick<InputItem, "ref" | "label">): InputItem {
  return {
    qid: "Q1",
    kind: "event",
    description: null,
    years: "",
    start_year: 0,
    end_year: 0,
    loc_confidence: "exact",
    wikipedia_title: null,
    extract: null,
    ...p,
  } as InputItem;
}

const E1 = item({
  ref: "E1",
  qid: "Q10",
  label: "Siege of Plataea",
  description: "siege during the Peloponnesian War",
  years: "429 BCE to 427 BCE",
  start_year: -429,
  end_year: -427,
  extract:
    "The siege of Plataea lasted from 429 BCE to 427 BCE. Spartan forces and their allies\nsurrounded the city. About 400 Plataeans and 80 Athenians held out inside the walls. " +
    "The defenders built a second wall of bricks.",
});
const E2 = item({
  ref: "E2",
  qid: "Q11",
  label: "Battle of Delium",
  years: "424 BCE",
  start_year: -424,
  end_year: -424,
  loc_confidence: "inherited",
  extract: "The Battle of Delium was fought in 424 BCE. Thebes defeated Athens in the fight. Thousands of hoplites took part.",
});
const P1 = item({
  ref: "P1",
  qid: "Q12",
  label: "Pericles",
  kind: "birth",
  description: "Athenian statesman",
  years: "495 BCE to 429 BCE",
  start_year: -495,
  end_year: -429,
  extract: "Pericles was born in Athens. He led the city for many years.",
});

const INPUT: StoryInput = {
  entry: { id: "test-place", place: "Test place", from: -500, to: -400, cell: "820007fffffffff" },
  generatedAt: "2026-10-29T00:00:00Z",
  dbRows: 1,
  eventsTotal: 12,
  othersTotal: 5,
  context: {
    ref: "C",
    text: "This area has 12 documented events and 5 documented people and places in this range. 1 of these 12 events have approximate locations.",
  },
  items: [E1, E2, P1],
};

const GOOD: Sentence[] = [
  { text: "The Siege of Plataea began in 429 BCE during the Peloponnesian War, when Spartan forces and their allies surrounded the city.", cites: ["E1"] },
  { text: "Within the walls, about 400 Plataeans and 80 Athenians held out, and the defenders built a second wall of bricks.", cites: ["E1"] },
  { text: "Later, in 424 BCE, the Battle of Delium was fought, and Thebes defeated Athens.", cites: ["E2"] },
  { text: "Thousands of hoplites took part, though the location of this battle is only approximate.", cites: ["E2"] },
  { text: "Pericles, an Athenian statesman, was born in Athens and led the city for many years.", cites: ["P1"] },
  { text: "Few events are documented here: 12 events and 5 people and places in total, and 1 of the 12 listed events has an approximate location.", cites: ["C"] },
];

function story(paragraphs: Sentence[][]) {
  return { id: "test-place", rulesVersion: 1, writtenAt: "2026-10-29", writtenBy: "test", paragraphs };
}
const GOOD_STORY = story([GOOD.slice(0, 3), GOOD.slice(3)]);

/** The good story plus one extra sentence (last), so length is never the issue. */
function withSentence(text: string, cites: string[], input: StoryInput = INPUT) {
  return checkStory(story([GOOD.slice(0, 3), [...GOOD.slice(3), { text, cites }]]), input);
}
function codes(f: { code: string }[]) {
  return f.map((x) => x.code);
}
function inputWithE1Extra(extra: string): StoryInput {
  return { ...INPUT, items: [{ ...E1, extract: `${E1.extract} ${extra}` }, E2, P1] };
}
function filler(n: number): string {
  return `The Siege of Plataea ${Array(n - 4).fill("bricks").join(" ")}`;
}

describe("allowlist", () => {
  it("is lower case, and holds the era words, months and sentence openers", () => {
    for (const w of ALLOWLIST) expect(w).toBe(w.toLowerCase());
    for (const w of ["bce", "wikipedia", "january", "december", "later", "nothing", "none", "the"]) expect(ALLOWLIST.has(w)).toBe(true);
    expect(ALLOWLIST.has("athens")).toBe(false);
  });
});

describe("checkStory", () => {
  it("passes a good story", () => {
    expect(checkStory(GOOD_STORY, INPUT)).toEqual([]);
  });

  describe("shape and refs", () => {
    it("fails shape when paragraphs is missing, and runs no other check", () => {
      const f = checkStory({ id: "x", rulesVersion: 1, writtenAt: "t", writtenBy: "w" }, INPUT);
      expect(codes(f)).toEqual(["shape"]);
      expect(f[0].detail).toContain("paragraphs");
    });
    it("fails shape for a story with no sentences", () => {
      expect(codes(checkStory(story([]), INPUT))).toEqual(["shape"]);
    });
    it("fails shape for something that is not an object", () => {
      expect(codes(checkStory(null, INPUT))).toEqual(["shape"]);
    });
    it("flags a sentence with no cites as uncited", () => {
      const f = withSentence("The siege of Plataea ended.", []);
      expect(codes(f)).toEqual(["uncited"]);
      expect(f[0].sentence).toBe(6);
    });
    it("flags an unknown ref and names it", () => {
      const f = withSentence("The siege of Plataea ended.", ["E9"]);
      expect(codes(f)).toEqual(["unknown-ref"]);
      expect(f[0].detail).toContain("E9");
    });
    it("checks a sentence against its known refs only when another ref is unknown", () => {
      const f = withSentence("The siege lasted 999 days.", ["E1", "E9"]);
      expect(codes(f).sort()).toEqual(["number", "unknown-ref"]);
    });
  });

  describe("length", () => {
    it("fails 59 words", () => {
      expect(codes(checkStory(story([[{ text: filler(59), cites: ["E1"] }]]), INPUT))).toEqual(["length"]);
    });
    it("passes 60 and 250 words", () => {
      expect(checkStory(story([[{ text: filler(60), cites: ["E1"] }]]), INPUT)).toEqual([]);
      expect(checkStory(story([[{ text: filler(250), cites: ["E1"] }]]), INPUT)).toEqual([]);
    });
    it("fails 251 words", () => {
      expect(codes(checkStory(story([[{ text: filler(251), cites: ["E1"] }]]), INPUT))).toEqual(["length"]);
    });
    it("counts words across all sentences", () => {
      const half = (n: number): Sentence => ({ text: filler(n), cites: ["E1"] });
      expect(codes(checkStory(story([[half(30)], [half(30)]]), INPUT))).toEqual([]);
      expect(codes(checkStory(story([[half(30)], [half(29)]]), INPUT))).toEqual(["length"]);
    });
  });

  describe("dashes", () => {
    it("flags an em dash", () => {
      const f = withSentence(`The siege of Plataea ${EM} bricks.`, ["E1"]);
      expect(codes(f)).toEqual(["dash"]);
      expect(f[0].detail).toContain("U+2014");
    });
    it("flags an en dash", () => {
      const f = withSentence(`The siege of Plataea ${EN} bricks.`, ["E1"]);
      expect(codes(f)).toEqual(["dash"]);
      expect(f[0].detail).toContain("U+2013");
    });
  });

  describe("numbers", () => {
    it("flags a number absent from the cited items", () => {
      const f = withSentence("The siege of Plataea involved 999 soldiers.", ["E1"]);
      expect(codes(f)).toEqual(["number"]);
      expect(f[0].detail).toContain("999");
    });
    it("flags a number found only in a different item", () => {
      const f = withSentence("The battle drew 400 men.", ["E2"]);
      expect(codes(f)).toEqual(["number"]);
    });
    it("passes the same number when the right item is cited", () => {
      expect(withSentence("The siege held 400 men.", ["E2", "E1"])).toEqual([]);
    });
    it("flags a wrong era", () => {
      const input = inputWithE1Extra("The treaty dates to 430 BC.");
      const f = withSentence("The treaty dates to 430 CE.", ["E1"], input);
      expect(codes(f)).toEqual(["number"]);
      expect(f[0].detail).toContain("430 CE");
    });
    it("matches BCE against BC", () => {
      const input = inputWithE1Extra("The treaty dates to 430 BC.");
      expect(withSentence("The treaty dates to 430 BCE.", ["E1"], input)).toEqual([]);
    });
    it("matches AD n and n AD as CE", () => {
      const input = inputWithE1Extra("A fort was raised in AD 79 and another in 120 AD.");
      expect(withSentence("A fort was raised in 79 CE and another in 120 CE.", ["E1"], input)).toEqual([]);
      expect(codes(withSentence("A fort was raised in 79 BCE.", ["E1"], input))).toEqual(["number"]);
    });
    it("reads a year range 'n to m ERA' as both numbers in that era", () => {
      const input = inputWithE1Extra("It ran from 300 to 250 BCE.");
      expect(withSentence("It ran from 300 BCE to 250 BCE.", ["E1"], input)).toEqual([]);
      expect(codes(withSentence("It ran from 300 CE.", ["E1"], input))).toEqual(["number"]);
    });
    it("accepts a number without an era when the digits appear anywhere", () => {
      expect(withSentence("The siege began in 429 and ended in 427.", ["E1"])).toEqual([]);
    });
    it("normalises thousands commas on both sides", () => {
      const input = inputWithE1Extra("About 10000 men took part.");
      expect(withSentence("About 10,000 men took part.", ["E1"], input)).toEqual([]);
      const input2 = inputWithE1Extra("About 10,000 men took part.");
      expect(withSentence("About 10000 men took part.", ["E1"], input2)).toEqual([]);
    });
    it("does not match digits inside a longer number", () => {
      const input = inputWithE1Extra("It happened in 1428.");
      expect(codes(withSentence("It happened in 428.", ["E1"], input))).toEqual(["number"]);
    });
    it("treats whitespace and newlines in the source as equal", () => {
      const input = inputWithE1Extra("It happened in 300\nBCE.");
      expect(withSentence("It happened in 300 BCE.", ["E1"], input)).toEqual([]);
    });
    it("checks decimals as a whole", () => {
      const input = inputWithE1Extra("It covered 3.5 miles.");
      expect(withSentence("It covered 3.5 miles.", ["E1"], input)).toEqual([]);
      expect(codes(withSentence("It covered 3.7 miles.", ["E1"], input))).toEqual(["number"]);
    });
  });

  describe("spelled-out numbers", () => {
    it("flags 'three' when neither 3 nor three is cited", () => {
      const f = withSentence("The battle saw three armies.", ["E2"]);
      expect(codes(f)).toEqual(["number"]);
      expect(f[0].detail).toContain("three");
    });
    it("passes 'three' when the cited text has the digit or the word", () => {
      const digit = { ...INPUT, items: [{ ...E2, extract: `${E2.extract} 3 armies met.` }, E1, P1] };
      expect(withSentence("The battle saw three armies.", ["E2"], digit)).toEqual([]);
      const word = { ...INPUT, items: [{ ...E2, extract: `${E2.extract} Three armies met.` }, E1, P1] };
      expect(withSentence("The battle saw three armies.", ["E2"], word)).toEqual([]);
    });
    it("reads 'dozen' as 12", () => {
      expect(withSentence("A dozen events are listed.", ["C"])).toEqual([]);
      expect(codes(withSentence("A dozen events are listed.", ["E1"]))).toEqual(["number"]);
    });
    it("flags 'thousands' absent from the cited text", () => {
      const f = withSentence("The siege killed thousands of people.", ["E1"]);
      expect(codes(f)).toEqual(["number"]);
      expect(f[0].detail).toContain("thousands");
    });
    it("passes 'thousands' when the cited text has it", () => {
      expect(withSentence("Thousands of hoplites took part.", ["E2"])).toEqual([]);
    });
  });

  describe("names", () => {
    it("flags an invented name", () => {
      const f = withSentence("The siege was led by Xerxes.", ["E1"]);
      expect(codes(f)).toEqual(["name"]);
      expect(f[0].detail).toContain("Xerxes");
    });
    it("flags a name that is in a different item only", () => {
      expect(codes(withSentence("The siege reached Thebes.", ["E1"]))).toEqual(["name"]);
    });
    it("passes allowlist words such as Later", () => {
      expect(withSentence("Later the siege ended.", ["E1"])).toEqual([]);
    });
    it("matches ignoring case, and by whole word only", () => {
      expect(withSentence("PLATAEA fell.", ["E1"])).toEqual([]);
      expect(codes(withSentence("Plata fell.", ["E1"]))).toEqual(["name"]);
    });
    it("handles accents, possessives and hyphens", () => {
      const input = inputWithE1Extra("Hernán met Moctezuma during the Anglo-Zulu War.");
      expect(withSentence("Hernán met envoys.", ["E1"], input)).toEqual([]);
      expect(withSentence("Moctezuma's envoys met them.", ["E1"], input)).toEqual([]);
      expect(withSentence("Moctezuma’s envoys met them.", ["E1"], input)).toEqual([]);
      expect(withSentence("The Anglo-Zulu conflict began.", ["E1"], input)).toEqual([]);
      const f = withSentence("The Anglo-Saxon conflict began.", ["E1"], input);
      expect(codes(f)).toEqual(["name"]);
      expect(f[0].detail).toContain("Anglo-Saxon");
    });
  });

  describe("context", () => {
    it("passes a sentence citing C that states its counts", () => {
      expect(withSentence("Few events are documented here: 12 events and 5 people and places.", ["C"])).toEqual([]);
    });
    it("flags a count that C does not state", () => {
      expect(codes(withSentence("Few events are documented here: 13 events.", ["C"]))).toEqual(["number"]);
    });
  });

  describe("era binding", () => {
    const withExtra = (extra: string) => inputWithE1Extra(extra);
    it("fails 'the 5th century BCE' against '5th century AD'", () => {
      const input = withExtra("It was rebuilt in the 5th century AD.");
      expect(codes(withSentence("It was rebuilt in the 5th century BCE.", ["E1"], input))).toEqual(["number"]);
      expect(withSentence("It was rebuilt in the 5th century CE.", ["E1"], input)).toEqual([]);
    });
    it("fails 'the 430s BCE' against a CE-only source", () => {
      const input = withExtra("It fell in the 430s CE.");
      expect(codes(withSentence("It fell in the 430s BCE.", ["E1"], input))).toEqual(["number"]);
      expect(withSentence("It fell in the 430s CE.", ["E1"], input)).toEqual([]);
    });
    it("reads eras case-insensitively and dotted", () => {
      const input = withExtra("It fell in AD 430.");
      expect(codes(withSentence("It fell in 430 bce.", ["E1"], input))).toEqual(["number"]);
      expect(codes(withSentence("It fell in 430 B.C.E.", ["E1"], input))).toEqual(["number"]);
      expect(withSentence("It fell in 430 ce.", ["E1"], input)).toEqual([]);
      expect(withSentence("It fell in 430 a.d.", ["E1"], input)).toEqual([]);
      const bc = withExtra("It fell in 430 b.c.");
      expect(withSentence("It fell in 430 BCE.", ["E1"], bc)).toEqual([]);
    });
    it("does not read a lone 'c.' (circa) as an era", () => {
      const input = withExtra("It fell in c. 430 BCE.");
      expect(withSentence("It fell in 430 BCE.", ["E1"], input)).toEqual([]);
      expect(codes(withSentence("It fell in 430 CE.", ["E1"], input))).toEqual(["number"]);
    });
    it("carries a range's era to both story numbers", () => {
      const input = withExtra("It fell in AD 430.");
      expect(codes(withSentence("It fell from 430 to 428 BCE.", ["E1"], input)).sort()).toEqual(["number", "number"]);
    });
    it("accepts an en dash range in the source for both numbers", () => {
      const input = withExtra("The war ran 431\u2013404 BC.");
      expect(withSentence("The war began in 431 BCE.", ["E1"], input)).toEqual([]);
      expect(withSentence("The war ended in 404 BCE.", ["E1"], input)).toEqual([]);
      expect(codes(withSentence("The war began in 431 CE.", ["E1"], input))).toEqual(["number"]);
      const hyphen = withExtra("The war ran 431-404 BC.");
      expect(withSentence("The war began in 431 BCE.", ["E1"], hyphen)).toEqual([]);
    });
  });

  describe("more spelled-out numbers", () => {
    it("reads thirty to ninety as digits", () => {
      expect(codes(withSentence("About forty men came.", ["E1"]))).toEqual(["number"]);
      const input = inputWithE1Extra("About 40 men came.");
      expect(withSentence("About forty men came.", ["E1"], input)).toEqual([]);
    });
    it("fails 'forty thousand' against 'Thousands'", () => {
      expect(codes(withSentence("Some forty thousand men took part.", ["E2"]))).toEqual(["number"]);
    });
    it("treats a compound as one number", () => {
      const stray = inputWithE1Extra("Twenty ships sailed in the 5th year.");
      expect(codes(withSentence("Some twenty-five ships sailed.", ["E1"], stray))).toEqual(["number"]);
      expect(withSentence("Some twenty-five ships sailed.", ["E1"], inputWithE1Extra("25 ships sailed."))).toEqual([]);
      expect(withSentence("Some twenty-five ships sailed.", ["E1"], inputWithE1Extra("Some twenty-five ships sailed."))).toEqual([]);
      expect(withSentence("Some twenty-five ships sailed.", ["E1"], inputWithE1Extra("Twenty five ships sailed."))).toEqual([]);
    });
    it("reads ordinal words and accepts the word, the ordinal digits or the bare number", () => {
      expect(codes(withSentence("The fifth siege failed.", ["E1"]))).toEqual(["number"]);
      expect(withSentence("The fifth siege failed.", ["E1"], inputWithE1Extra("The fifth siege failed."))).toEqual([]);
      expect(withSentence("The fifth siege failed.", ["E1"], inputWithE1Extra("The 5th siege failed."))).toEqual([]);
      expect(withSentence("The fifth siege failed.", ["E1"], inputWithE1Extra("5 sieges failed."))).toEqual([]);
      expect(codes(withSentence("The twenty-first siege failed.", ["E1"]))).toEqual(["number"]);
    });
    it("requires dozens, scores and billions as words, case-insensitively", () => {
      expect(codes(withSentence("Many dozens fled.", ["E1"]))).toEqual(["number"]);
      expect(codes(withSentence("Many scores fled.", ["E1"]))).toEqual(["number"]);
      expect(codes(withSentence("Many billions fled.", ["E1"]))).toEqual(["number"]);
      expect(withSentence("Many DOZENS fled.", ["E1"], inputWithE1Extra("Dozens fled."))).toEqual([]);
    });
    it("matches number words case-insensitively", () => {
      expect(codes(withSentence("THREE armies met.", ["E2"])).sort()).toEqual(["name", "number"]);
    });
  });

  describe("unicode", () => {
    it("matches a composed name against decomposed source text", () => {
      const nfd = `Herna${String.fromCharCode(0x301)}n met envoys.`;
      const input = inputWithE1Extra(nfd);
      expect(withSentence("Hernán met envoys.", ["E1"], input)).toEqual([]);
      const input2 = inputWithE1Extra("Hernán met envoys.");
      expect(withSentence(nfd, ["E1"], input2)).toEqual([]);
    });
  });

  describe("number phrases as units", () => {
    const fails = (extra: string, text: string) => codes(withSentence(text, ["E1"], inputWithE1Extra(extra)));
    const passes = (extra: string, text: string) => withSentence(text, ["E1"], inputWithE1Extra(extra));
    it("does not take 'twenty-five' inside 'twenty-five-year' from stray parts", () => {
      expect(fails("Twenty ships sailed in the 5th year.", "A twenty-five-year truce followed.")).toEqual(["number"]);
      expect(passes("A 25-year truce followed.", "A twenty-five-year truce followed.")).toEqual([]);
    });
    it("fails '5th-century BCE' against '5th century AD'", () => {
      expect(fails("It was rebuilt in the 5th century AD.", "It was a 5th-century BCE temple.")).toEqual(["number"]);
    });
    it("fails 'fifth century BCE' against '5th century AD' and 'fifth century AD'", () => {
      expect(fails("It was rebuilt in the 5th century AD.", "It was rebuilt in the fifth century BCE.")).toEqual(["number"]);
      expect(fails("It was rebuilt in the fifth century AD.", "It was rebuilt in the fifth century BCE.")).toEqual(["number"]);
    });
    it("fails eras glued to digits or dotted, against AD 430", () => {
      for (const t of ["It fell in 430BC.", "It fell in 430BCE.", "It fell in 430 B.C.E, in a raid."]) {
        expect(fails("It fell in AD 430.", t)).toEqual(["number"]);
      }
      expect(passes("It fell in AD 430.", "It fell in 430CE.")).toEqual([]);
    });
    it("keeps millennium and century apart, and a unit apart from a bare number", () => {
      expect(fails("It rose in the 5th century BCE.", "It rose in the 5th millennium BCE.")).toEqual(["number"]);
      expect(fails("It rose in 5 BCE.", "It rose in the 5th century BCE.")).toEqual(["number"]);
    });
    it("reads magnitude words with the number before them", () => {
      expect(fails("40 ships sailed. Thousands of men came.", "Some forty thousand men took part.")).toEqual(["number"]);
      expect(passes("About 40,000 men took part.", "Some forty thousand men took part.")).toEqual([]);
      expect(passes("About 2000000 men took part.", "Some two million men took part.")).toEqual([]);
    });
    it("matches ordinal words and digits, with or without a hyphen, and BC against BCE", () => {
      expect(passes("It was rebuilt in the 5th century BC.", "It was rebuilt in the fifth century BCE.")).toEqual([]);
      expect(passes("It was rebuilt in the fifth century BC.", "It was a 5th-century BCE temple.")).toEqual([]);
    });
    it("fails 'twenty five' (spaced) against stray Twenty and 5th", () => {
      expect(fails("Twenty ships sailed in the 5th year.", "Some twenty five ships sailed.")).toEqual(["number"]);
    });
    it("is not fooled by words that merely look like keys, such as 'constructor'", () => {
      expect(passes("Nothing here.", "The constructor of ships arrived.")).toEqual([]);
    });
  });
});
