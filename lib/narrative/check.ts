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

const WORD_VALUE = new Map<string, number>([
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
  ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16],
  ["seventeen", 17], ["eighteen", 18], ["nineteen", 19], ["dozen", 12],
  ["twenty", 20], ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
  ["first", 1], ["second", 2], ["third", 3], ["fourth", 4], ["fifth", 5], ["sixth", 6], ["seventh", 7], ["eighth", 8],
  ["ninth", 9], ["tenth", 10], ["eleventh", 11], ["twelfth", 12], ["thirteenth", 13], ["fourteenth", 14],
  ["fifteenth", 15], ["sixteenth", 16], ["seventeenth", 17], ["eighteenth", 18], ["nineteenth", 19], ["twentieth", 20],
  ["thirtieth", 30], ["fortieth", 40], ["fiftieth", 50], ["sixtieth", 60], ["seventieth", 70], ["eightieth", 80], ["ninetieth", 90],
]);
const COMPOUND_TENS = new Map<string, number>([
  ["twenty", 20], ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
]);
const MAGNITUDE = new Map<string, number>([["hundred", 100], ["thousand", 1000], ["million", 1e6], ["billion", 1e9]]);
/** These carry no value: the very same word must appear in the cited text. */
const PLURAL_WORDS = new Set(["hundreds", "thousands", "millions", "billions", "dozens", "scores"]);
const UNIT_WORDS = new Map<string, Unit>([
  ["century", "century"], ["centuries", "century"], ["millennium", "millennium"], ["millennia", "millennium"],
]);

type Unit = "" | "century" | "millennium" | "decade";
type Era = "" | "BCE" | "CE";

/**
 * Whitespace is one space, text is NFC, curly apostrophes are straight, thousands commas are removed,
 * and eras are canonical: BCE, CE, or AD (written any case, dotted or not, even glued to digits).
 * AD n becomes n CE.
 */
function normalise(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/’/g, "'")
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, "")
    .replace(/(?<![\p{L}.])(b\.c\.e\.?|b\.c\.|bce|bc|c\.e\.?|ce|a\.d\.?|ad)(?![\p{L}\p{N}])/giu, (m) => {
      const e = m.replace(/\./g, "").toUpperCase();
      return e === "BC" ? "BCE" : e;
    })
    .replace(/\bAD (\d+(?:\.\d+)?)/g, "$1 CE")
    .replace(/\bAD\b/g, "CE");
}

type Tok = { kind: "num" | "word" | "join" | "punct"; text: string; start: number; end: number; value: number; suffix: string };

function tokenise(text: string): Tok[] {
  const re = /(\d+(?:\.\d+)?)(?:(st|nd|rd|th|s)(?![\p{L}]))?|([\p{L}\p{M}]+)|([-\u2013])|([^\s\p{L}\p{M}\d\-\u2013])/gu;
  const out: Tok[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (m[1] !== undefined) out.push({ kind: "num", text: m[0], start, end, value: Number(m[1]), suffix: m[2] ?? "" });
    else if (m[3] !== undefined) out.push({ kind: "word", text: m[0], start, end, value: 0, suffix: "" });
    else if (m[4] !== undefined) out.push({ kind: "join", text: m[0], start, end, value: 0, suffix: "" });
    else out.push({ kind: "punct", text: m[0], start, end, value: 0, suffix: "" });
  }
  return out;
}

type Phrase = { value: string; unit: Unit; era: Era; plural: boolean; text: string; first: number; last: number };

/**
 * Number phrases as units: value (digits, ordinals, number words, compounds, magnitudes), unit
 * (century, millennium, decade) and era. Used on the story and the source alike.
 */
function findNumbers(text: string): Phrase[] {
  const toks = tokenise(text);
  const word = (i: number): string | undefined => (toks[i]?.kind === "word" ? toks[i].text.toLowerCase() : undefined);
  const skipJoin = (i: number): number => (toks[i]?.kind === "join" ? i + 1 : i);
  const out: Phrase[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    let value: number | undefined;
    let unit: Unit = "";
    let plural = false;
    let j = i + 1;
    if (t.kind === "num") {
      value = t.value;
      if (t.suffix === "s") unit = "decade";
    } else if (t.kind === "word") {
      const w = t.text.toLowerCase();
      if (PLURAL_WORDS.has(w)) {
        plural = true;
        out.push({ value: w, unit: "", era: "", plural, text: t.text, first: i, last: i });
        i = j;
        continue;
      }
      const tens = COMPOUND_TENS.get(w);
      const mag = MAGNITUDE.get(w);
      if (tens !== undefined) {
        value = tens;
        const k = skipJoin(j);
        const u = word(k);
        const uv = u === undefined ? undefined : WORD_VALUE.get(u);
        if (uv !== undefined && uv < 10) {
          value += uv;
          j = k + 1;
        }
      } else if (mag !== undefined) {
        value = mag;
      } else {
        value = WORD_VALUE.get(w);
      }
    }
    if (value === undefined) {
      i++;
      continue;
    }
    if (unit === "") {
      for (;;) {
        const k = skipJoin(j);
        const m = MAGNITUDE.get(word(k) ?? "");
        if (m === undefined) break;
        value *= m;
        j = k + 1;
      }
      const k = skipJoin(j);
      const u = UNIT_WORDS.get(word(k) ?? "");
      if (u) {
        unit = u;
        j = k + 1;
      }
    }
    let era: Era = "";
    if (toks[j]?.kind === "word" && (toks[j].text === "BCE" || toks[j].text === "CE")) {
      era = toks[j].text as Era;
      j++;
    }
    out.push({ value: String(value), unit, era, plural, text: text.slice(t.start, toks[j - 1].end), first: i, last: j - 1 });
    i = j;
  }
  // "n to m ERA", "n-m ERA": the closing era and unit bind to the opening number too.
  for (let x = out.length - 2; x >= 0; x--) {
    const p = out[x];
    const q = out[x + 1];
    if (p.plural || q.plural || q.first !== p.last + 2) continue;
    const between = toks[p.last + 1];
    if (!(between.kind === "join" || (between.kind === "word" && between.text.toLowerCase() === "to"))) continue;
    if (p.era === "") p.era = q.era;
    if (p.unit === "" && q.unit !== "decade") p.unit = q.unit;
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
  const keys = new Set<string>();
  const valueUnit = new Set<string>();
  const values = new Set<string>();
  for (const p of findNumbers(source)) {
    if (p.plural) {
      keys.add(`plural:${p.value}`);
      continue;
    }
    keys.add(`${p.value}|${p.unit}|${p.era}`);
    valueUnit.add(`${p.value}|${p.unit}`);
    values.add(p.value);
  }
  const bad: string[] = [];
  for (const p of findNumbers(sentence)) {
    let ok: boolean;
    if (p.plural) ok = keys.has(`plural:${p.value}`);
    else if (p.era) ok = keys.has(`${p.value}|${p.unit}|${p.era}`);
    else if (p.unit) ok = valueUnit.has(`${p.value}|${p.unit}`);
    else ok = values.has(p.value);
    if (!ok) bad.push(p.text);
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
