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

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", dozen: "12",
};
const BIG_WORDS = ["hundred", "thousand", "million"];

/** Whitespace is one space, curly apostrophes are straight, thousands commas and eras are normalised. */
function normalise(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/’/g, "'")
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, "")
    .replace(/\bBC\b/g, "BCE")
    .replace(/\bAD (\d+)/g, "$1 CE")
    .replace(/(\d+) AD\b/g, "$1 CE");
}

type SourceNumbers = { plain: Set<string>; withEra: Set<string> };

const NUM = String.raw`\d+(?:\.\d+)?`;

function sourceNumbers(text: string): SourceNumbers {
  const plain = new Set<string>();
  const withEra = new Set<string>();
  for (const m of text.matchAll(new RegExp(NUM, "g"))) plain.add(m[0]);
  // "430 BCE", "430 to 426 BCE": both numbers of a range carry the era that closes it.
  for (const m of text.matchAll(new RegExp(`(${NUM})(?: to (${NUM}))? (BCE|CE)\\b`, "g"))) {
    withEra.add(`${m[1]} ${m[3]}`);
    if (m[2]) withEra.add(`${m[2]} ${m[3]}`);
  }
  return { plain, withEra };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{M}\\p{N}])`, "iu").test(text);
}

function checkNumbers(sentence: string, source: string): string[] {
  const bad: string[] = [];
  const { plain, withEra } = sourceNumbers(source);
  for (const m of sentence.matchAll(new RegExp(`(${NUM})(?: (BCE|CE)\\b)?`, "g"))) {
    const ok = m[2] ? withEra.has(`${m[1]} ${m[2]}`) : plain.has(m[1]);
    if (!ok) bad.push(m[0]);
  }
  for (const m of sentence.matchAll(/\b[A-Za-z]+\b/g)) {
    const w = m[0].toLowerCase();
    const digits = NUMBER_WORDS[w];
    if (digits !== undefined) {
      if (!plain.has(digits) && !hasWord(source, w)) bad.push(m[0]);
      continue;
    }
    const big = BIG_WORDS.find((b) => w === b || w === `${b}s`);
    if (big && !new RegExp(`\\b${big}s?\\b`, "i").test(source)) bad.push(m[0]);
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
