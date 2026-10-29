/**
 * Year conventions for Chronoglobe.
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
