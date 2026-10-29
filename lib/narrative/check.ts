/**
 * The story checker (spec 6.6). Pure: a story and its frozen input in, a list of failures out.
 * A failing story is fixed in its text, never by loosening these checks or the allowlist.
 */
import { ALLOWLIST } from "./allowlist.ts";
import { sourceText } from "./input.ts";
import { StorySchema, type StoryInput } from "./types.ts";

export type Failure = {
  code: "shape" | "unknown-ref" | "uncited" | "length" | "dash" | "number" | "name";
  /** 0-based index across all paragraphs. */
  sentence?: number;
  detail: string;
};

const MIN_WORDS = 60;
const MAX_WORDS = 250;

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, dozen: 12,
};
const TENS: Record<string, number> = { thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const COMPOUND_TENS: Record<string, number> = { twenty: 20, ...TENS };
const ORDINAL_UNITS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20,
  thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90,
};
/** Must appear as these words in the cited text (a plural may stand for its singular, except dozens and scores). */
const BIG_WORDS = /^(?:hundreds?|thousands?|millions?|billions?)$/;
const EXACT_WORDS = new Set(["dozens", "scores"]);

/**
 * Whitespace is one space, text is NFC, curly apostrophes are straight, thousands commas are removed,
 * and eras are canonical: BCE, CE, or AD (written any case, dotted or not). AD n becomes n CE.
 */
function normalise(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/’/g, "'")
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, "")
    .replace(/(?<![\p{L}\p{N}.])(b\.c\.e\.|b\.c\.|c\.e\.|a\.d\.|bce|bc|ce|ad)(?![\p{L}\p{N}])/giu, (m) => {
      const e = m.replace(/\./g, "").toUpperCase();
      return e === "BC" ? "BCE" : e;
    })
    .replace(/\bAD (\d+(?:\.\d+)?)/g, "$1 CE")
    .replace(/\bAD\b/g, "CE");
}

const NUM = String.raw`\d+(?:\.\d+)?`;
/** A number, its ordinal or decade suffix, and an optional "century" or "millennium" after it. */
const NUMBER_PART = String.raw`(${NUM})(?:st|nd|rd|th|s)?(?: (?:centur(?:y|ies)|millenni(?:um|a)))?`;
/** "n", "n to m", "n-m" or "n<en dash>m", then an optional era that binds to every number in the run. */
const NUMBER_RUN = new RegExp(`${NUMBER_PART}(?: ?(?:to|-|\u2013) ?${NUMBER_PART})?(?: (BCE|CE)\\b)?`, "g");

type Found = { n: string; era: string | null; text: string };

/** One pass, used on the story and the source alike, so both bind eras the same way. */
function findNumbers(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(NUMBER_RUN)) {
    const era = m[3] ?? null;
    out.push({ n: m[1], era, text: m[0] });
    if (m[2]) out.push({ n: m[2], era, text: m[0] });
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{M}\\p{N}])`, "iu").test(text);
}

function checkNumbers(sentence: string, source: string): string[] {
  const bad: string[] = [];
  const plain = new Set<string>();
  const withEra = new Set<string>();
  for (const f of findNumbers(source)) {
    plain.add(f.n);
    if (f.era) withEra.add(`${f.n} ${f.era}`);
  }
  for (const f of findNumbers(sentence)) {
    const ok = f.era ? withEra.has(`${f.n} ${f.era}`) : plain.has(f.n);
    if (!ok) bad.push(f.era ? `${f.n} ${f.era}` : f.n);
  }

  // Spelled-out numbers are read as digits. A compound ("twenty-five") is one number, never its parts.
  const spelled = (value: number, word: string, alt: string[]) => plain.has(String(value)) || [word, ...alt].some((w) => hasWord(source, w));
  for (const m of sentence.matchAll(/[A-Za-z]+(?:-[A-Za-z]+)*/g)) {
    const token = m[0].toLowerCase();
    const parts = token.split("-");
    if (parts.length === 2 && parts[0] in COMPOUND_TENS && (parts[1] in UNITS || parts[1] in ORDINAL_UNITS) && (UNITS[parts[1]] ?? ORDINAL_UNITS[parts[1]]) < 10) {
      const value = COMPOUND_TENS[parts[0]] + (UNITS[parts[1]] ?? ORDINAL_UNITS[parts[1]]);
      if (!spelled(value, token, [`${parts[0]} ${parts[1]}`])) bad.push(m[0]);
      continue;
    }
    for (const w of parts) {
      const value = UNITS[w] ?? TENS[w] ?? ORDINAL_UNITS[w];
      if (value !== undefined) {
        if (!spelled(value, w, [])) bad.push(w);
      } else if (BIG_WORDS.test(w)) {
        if (!new RegExp(`\\b${w.replace(/s$/, "")}s?\\b`, "i").test(source)) bad.push(w);
      } else if (EXACT_WORDS.has(w)) {
        if (!hasWord(source, w)) bad.push(w);
      }
    }
  }
  return bad;
}

function checkNames(sentence: string, source: string): string[] {
  const bad: string[] = [];
  for (const m of sentence.matchAll(/\p{Lu}[\p{L}\p{M}'’-]*/gu)) {
    const token = m[0].replace(/['’]s$/i, "").replace(/['’-]+$/, "");
    if (token.length === 0) continue;
    if (ALLOWLIST.has(token.toLowerCase())) continue;
    if (hasWord(source, token)) continue;
    if (token.includes("-") && token.split("-").every((p) => p.length > 0 && (ALLOWLIST.has(p.toLowerCase()) || hasWord(source, p)))) continue;
    bad.push(token);
  }
  return bad;
}

export function checkStory(story: unknown, input: StoryInput): Failure[] {
  const parsed = StorySchema.safeParse(story);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "story"}: ${i.message}`).join("; ");
    return [{ code: "shape", detail }];
  }
  const sentences = parsed.data.paragraphs.flat();
  if (sentences.length === 0) return [{ code: "shape", detail: "the story has no sentences" }];

  const failures: Failure[] = [];
  sentences.forEach((s, index) => {
    if (s.cites.length === 0) failures.push({ code: "uncited", sentence: index, detail: "sentence cites no ref" });

    const known: string[] = [];
    for (const ref of s.cites) {
      try {
        sourceText(input, ref);
        known.push(ref);
      } catch {
        failures.push({ code: "unknown-ref", sentence: index, detail: `ref ${ref} is not in the input` });
      }
    }

    for (const ch of ["\u2014", "\u2013"]) {
      if (s.text.includes(ch)) {
        const name = ch === "\u2014" ? "em dash" : "en dash";
        failures.push({ code: "dash", sentence: index, detail: `${name} (U+${ch.codePointAt(0)!.toString(16).toUpperCase()})` });
      }
    }

    if (known.length === 0) return;
    const source = normalise(known.map((r) => sourceText(input, r)).join("\n"));
    const text = normalise(s.text);
    for (const n of checkNumbers(text, source)) {
      failures.push({ code: "number", sentence: index, detail: `"${n}" is not in ${known.join(", ")}` });
    }
    for (const n of checkNames(text, source)) {
      failures.push({ code: "name", sentence: index, detail: `"${n}" is not in ${known.join(", ")}` });
    }
  });

  const words = sentences.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  if (words < MIN_WORDS || words > MAX_WORDS) {
    failures.push({ code: "length", detail: `${words} words; must be ${MIN_WORDS} to ${MAX_WORDS}` });
  }
  return failures;
}
