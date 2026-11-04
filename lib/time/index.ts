/**
 * Year conventions for Circa.
 *
 * Storage uses HISTORICAL numbering: 1 BCE = -1, 1 CE = 1, and there is no year 0.
 *
 * Wikidata encodes the same year two ways (verified live 2026-10-28, see docs/decisions.md):
 * - Entity JSON (wbgetentities, dumps): historical numbering. "-0490-..." is 490 BCE.
 * - SPARQL (WDQS) xsd:dateTime: astronomical numbering. "-0489-..." is 490 BCE, "0000-..." is 1 BCE.
 *   Day-precision Julian dates are also converted to proleptic Gregorian, which can move a date
 *   that falls within a few days of New Year into the neighbouring year. We accept that error.
 */

export type Interval = { start: number; end: number };
export type YearRange = { from: number; to: number };

/** The year window the data set covers, and the only years the API accepts. */
export const MIN_YEAR = -3500;
export const MAX_YEAR = 2026;

/** Wikidata time precision codes we understand. 9 = year; finer codes collapse to a year. */
export const PRECISION = { millennium: 6, century: 7, decade: 8, year: 9 } as const;

export function astronomicalToHistorical(year: number): number {
  return year <= 0 ? year - 1 : year;
}

export function historicalToAstronomical(year: number): number {
  if (year === 0) throw new Error("Year 0 does not exist in historical numbering");
  return year < 0 ? year + 1 : year;
}

const TIME_RE = /^([+-]?)(\d+)-\d\d-\d\dT/;

function parseSignedYear(time: string): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`Unrecognized time string: ${time}`);
  const abs = Number(m[2]);
  return m[1] === "-" ? -abs : abs;
}

/** Year from a Wikidata entity JSON time value, e.g. "-0490-00-00T00:00:00Z". */
export function yearFromEntityTime(time: string): number {
  const year = parseSignedYear(time);
  if (year === 0) throw new Error(`Entity JSON time has year 0: ${time}`);
  return year;
}

/** Year from a WDQS SPARQL xsd:dateTime string, e.g. "-0489-08-07T00:00:00Z". */
export function yearFromSparqlTime(time: string): number {
  return astronomicalToHistorical(parseSignedYear(time));
}

/**
 * The span of years a Wikidata date actually claims, given its precision.
 * Matches Wikibase's own formatter: decades FLOOR ("1459" at decade precision is the 1450s),
 * centuries and millennia CEIL ("1900" at century precision is the 19th century, 1801 to 1900).
 * BCE spans mirror CE spans, so the 5th century BCE is -500 to -401.
 */
export function effectiveInterval(year: number, precision: number): Interval {
  if (year === 0) throw new Error("Year 0 does not exist in historical numbering");
  if (!Number.isInteger(precision) || precision < 0 || precision > 14) {
    throw new Error(`Unknown Wikidata precision: ${precision}`);
  }
  if (precision >= PRECISION.year) return { start: year, end: year };

  const sign = year < 0 ? -1 : 1;
  const abs = Math.abs(year);
  let lo: number;
  let hi: number;
  if (precision === PRECISION.decade) {
    lo = Math.max(Math.floor(abs / 10) * 10, 1);
    hi = Math.floor(abs / 10) * 10 + 9;
  } else {
    // century (7) = 10^2 years, millennium (6) = 10^3, and so on for coarser codes.
    const unit = 10 ** (PRECISION.year - precision);
    const n = Math.ceil(abs / unit);
    lo = (n - 1) * unit + 1;
    hi = n * unit;
  }
  // For BCE, the larger absolute value is the earlier year.
  return sign > 0 ? { start: lo, end: hi } : { start: -hi, end: -lo };
}

/** A year a user may ask for: an integer inside the data window, and never year 0. */
export function isQueryableYear(year: number): boolean {
  return Number.isInteger(year) && year !== 0 && year >= MIN_YEAR && year <= MAX_YEAR;
}

/** Range filtering uses overlap, not containment. Mirrors the SQL filter. */
export function overlaps(event: Interval, range: YearRange): boolean {
  return event.start <= range.to && event.end >= range.from;
}

export function formatYear(year: number): string {
  return year < 0 ? `${-year} BCE` : `${year} CE`;
}

export function formatRange(start: number, end: number): string {
  return start === end ? formatYear(start) : `${formatYear(start)} to ${formatYear(end)}`;
}

/**
 * The range slider's non-linear scale: integer positions 0..SLIDER_STEPS, piecewise linear between
 * anchors, so recent centuries get more resolution than deep antiquity (about 12.5 years per step
 * before 1000 BCE, about 1.6 after 1700). Interpolation runs in astronomical numbering, which has
 * a year 0, and converts back at the end, so the slider can never produce year 0.
 */
export const SLIDER_STEPS = 1000;
const SLIDER_ANCHORS: [position: number, year: number][] = [
  [0, MIN_YEAR],
  [200, -1000],
  [400, 1],
  [600, 1000],
  [800, 1700],
  [1000, MAX_YEAR],
].map(([p, y]) => [p, historicalToAstronomical(y)]);

export function sliderToYear(position: number): number {
  const p = Math.min(Math.max(position, 0), SLIDER_STEPS);
  const i = SLIDER_ANCHORS.findIndex(([ap], k) => k > 0 && p <= ap);
  const [p0, y0] = SLIDER_ANCHORS[i - 1];
  const [p1, y1] = SLIDER_ANCHORS[i];
  return astronomicalToHistorical(Math.round(y0 + ((p - p0) / (p1 - p0)) * (y1 - y0)));
}

export function yearToSlider(year: number): number {
  const a = Math.min(Math.max(historicalToAstronomical(year), SLIDER_ANCHORS[0][1]), SLIDER_ANCHORS.at(-1)![1]);
  const i = SLIDER_ANCHORS.findIndex(([, ay], k) => k > 0 && a <= ay);
  const [p0, y0] = SLIDER_ANCHORS[i - 1];
  const [p1, y1] = SLIDER_ANCHORS[i];
  return Math.round(p0 + ((a - y0) / (y1 - y0)) * (p1 - p0));
}

/**
 * The year `years` whole years earlier (dir -1) or later (dir 1), for the step buttons beside the dates.
 * Whole years, not slider notches: after 1700 a notch is about 1.6 years, so stepping by notches skips
 * years. Counted in astronomical numbering, so it never lands on year 0; clamped to the scale's ends.
 */
export function nudgeYear(year: number, dir: -1 | 1, years = 1): number {
  const a = historicalToAstronomical(year) + dir * years;
  const lo = historicalToAstronomical(MIN_YEAR);
  const hi = historicalToAstronomical(MAX_YEAR);
  return astronomicalToHistorical(Math.min(Math.max(a, lo), hi));
}

/** Number of years in an inclusive historical range. There is no year 0, so -1 to 1 is 2 years. */
export function yearCount(from: number, to: number): number {
  return historicalToAstronomical(to) - historicalToAstronomical(from) + 1;
}

/** The middle year of a range, rounded toward the earlier year. Never 0. */
export function midYear(from: number, to: number): number {
  const mid = Math.floor((historicalToAstronomical(from) + historicalToAstronomical(to)) / 2);
  return astronomicalToHistorical(mid);
}
