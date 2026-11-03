/**
 * Publishes the processed historical-basemaps outlines with the site, as GPL-3.0 asks of a public app built on
 * them (CLAUDE.md, Licensing; not legal advice). Writes public/open-data/: the outlines as gzipped GeoJSON, a
 * README saying what they are and how they were changed, and the license text. Runs before every build.
 *
 * Usage: npm run open-data
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import Database from "better-sqlite3";
import { OUTLINES_FILE } from "../lib/base.ts";
import { DB_PATH } from "../lib/db/schema.ts";
import { PINS } from "./boundaries.ts";

const OUT = join(import.meta.dirname, "..", "public", "open-data");

function readme(features: number): string {
  const { repo, commit } = PINS.basemaps;
  return `Circa: processed historical-basemaps outlines
==============================================

${OUTLINES_FILE} holds ${features.toLocaleString("en-US")} historical region outlines that Circa
(samarchive.com/circa) uses to choose the region a click selects. They are derived from
historical-basemaps by Andre Ourednik and contributors:

  https://github.com/${repo}
  at commit ${commit}

historical-basemaps is licensed under the GNU General Public License, version 3. This derived data is
released under the same license; the full text is in GPL-3.0.txt next to this file.

What was changed from the source files:
- Each world_<year>.geojson snapshot was given the years closest to it (from_year and to_year, historical
  numbering: 1 BCE is -1, and there is no year 0).
- Features without a name were dropped. One name mangled in the source, "M?ori" in world_1878, was
  corrected to "Māori", the spelling of the neighbouring snapshots.
- Names the site's owner struck were dropped: see etl/struck-names.json in the source code.
- Shapes were simplified at 0.02 degrees and coordinates rounded to 3 decimal places.

Each feature's properties are name, from_year and to_year. The outlines are approximate and are not maps
of record. The code that made this file is the etl/ folder of Circa's source repository.
`;
}

function main() {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db.prepare("SELECT name, from_year, to_year, geojson FROM regions WHERE source = 'basemaps' ORDER BY from_year, name").all() as {
    name: string;
    from_year: number;
    to_year: number;
    geojson: string;
  }[];
  db.close();
  const features = rows.map((r) => ({ type: "Feature", properties: { name: r.name, from_year: r.from_year, to_year: r.to_year }, geometry: JSON.parse(r.geojson) }));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, OUTLINES_FILE), gzipSync(JSON.stringify({ type: "FeatureCollection", features })));
  writeFileSync(join(OUT, "README.txt"), readme(features.length));
  copyFileSync(join(import.meta.dirname, "licenses", "GPL-3.0.txt"), join(OUT, "GPL-3.0.txt"));
  console.log(`Wrote public/open-data/: ${features.length.toLocaleString("en-US")} outlines.`);
}

if (import.meta.main) main();
