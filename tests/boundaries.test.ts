import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { applyStrikes, nearestProvince, parseBasemaps, parseCliopatria, parseProvinces, regionNamesDoc, snapshotRanges, unzipEntry, type NewRegion } from "../etl/boundaries-parse.ts";
import { historicalToAstronomical, MAX_YEAR, MIN_YEAR } from "../lib/time/index.ts";

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "boundaries", `${name}.json`), "utf8"));

describe("parseCliopatria", () => {
  const rows = parseCliopatria(fixture("cliopatria"));

  it("drops RELATION rows and parenthesised names", () => {
    const names = rows.map((r) => r.name);
    expect(names).not.toContain("Relation Row");
    expect(names.some((n) => n.startsWith("("))).toBe(false);
    expect(names).toContain("Roman Republic");
  });

  it("maps FromYear 0 to 1 and ToYear 0 to -1, and keeps other years", () => {
    expect(rows.find((r) => r.name === "Zero Start")).toMatchObject({ from_year: 1, to_year: 100 });
    expect(rows.find((r) => r.name === "Zero End")).toMatchObject({ from_year: -50, to_year: -1 });
    expect(rows.find((r) => r.name === "Roman Republic")).toMatchObject({ source: "cliopatria", from_year: -509, to_year: -28, wikidata: "Q17167" });
    expect(rows.every((r) => r.from_year !== 0 && r.to_year !== 0 && r.from_year <= r.to_year)).toBe(true);
  });

  it("keeps the dataset's own area and stores bbox and GeoJSON text", () => {
    const r = rows.find((x) => x.name === "Roman Republic")!;
    expect(r.area).toBe(123456);
    expect([r.west, r.south, r.east, r.north]).toEqual([10, 40, 14, 44]);
    expect(JSON.parse(r.geojson).type).toBe("Polygon");
  });
});

describe("parseBasemaps and applyStrikes", () => {
  const rows = parseBasemaps(fixture("basemaps"), { from: -600, to: -401 });

  it("drops null and blank names and trims the rest", () => {
    expect(rows.map((r) => r.name)).toEqual(["Persian Empire", "Persian Empire", "Athens"]);
    expect(rows[0]).toMatchObject({ source: "basemaps", from_year: -600, to_year: -401, wikidata: null });
    expect(rows[0].area).toBeGreaterThan(0); // computed with ringAreaKm2, the file has no area
  });

  it("drops a struck basemaps name and leaves a Cliopatria row of the same name", () => {
    const clio = parseCliopatria(fixture("cliopatria")).filter((r) => r.name === "Roman Republic");
    const kept = applyStrikes([...rows, ...clio], new Set(["Athens", "Roman Republic"]));
    expect(kept.map((r) => r.name)).toEqual(["Persian Empire", "Persian Empire", "Roman Republic"]);
    expect(kept.at(-1)!.source).toBe("cliopatria");
  });
});

describe("snapshotRanges", () => {
  it("gives each snapshot the years closest to it, touching with no gap or overlap", () => {
    const r = snapshotRanges([-3000, -2000, -1, 100]);
    expect(r.map((x) => x.year)).toEqual([-3000, -2000, -1, 100]);
    expect(r[0].from).toBe(MIN_YEAR);
    expect(r.at(-1)!.to).toBe(MAX_YEAR);
    for (let i = 1; i < r.length; i++) {
      expect(historicalToAstronomical(r[i].from)).toBe(historicalToAstronomical(r[i - 1].to) + 1);
    }
    for (const x of r) {
      expect(x.from).toBeLessThanOrEqual(x.year);
      expect(x.to).toBeGreaterThanOrEqual(x.year);
    }
    expect(r[1]).toMatchObject({ to: -1001 }); // -2000 and -1 are 1999 years apart; -2000 owns up to the midpoint
    expect(r[2]).toMatchObject({ from: -1000, to: 50 });
  });

  it("never lets a range contain year 0", () => {
    const r = snapshotRanges([-10, 10]);
    expect(r[0].to).toBe(-1); // the midpoint falls on astronomical 0, which is 1 BCE, not a year 0
    expect(r[1].from).toBe(1);
    for (const x of r) {
      expect(x.from).not.toBe(0);
      expect(x.to).not.toBe(0);
    }
  });

  it("drops a snapshot older than MIN_YEAR", () => {
    const r = snapshotRanges([-8000, -3000, 1000]);
    expect(r.map((x) => x.year)).toEqual([-3000, 1000]);
    expect(r[0].from).toBe(MIN_YEAR);
  });
});

describe("parseProvinces", () => {
  it("parses the fixture", () => {
    const rows = parseProvinces(fixture("naturalearth"));
    const attiki = rows.find((r) => r.id === "GRC-2884")!;
    expect(attiki).toMatchObject({ name: "Attiki", country: "Greece", lon: 23.7997, lat: 38.0626 });
    expect(attiki.area).toBeGreaterThan(0);
    expect(attiki.west).toBeLessThan(attiki.east);
  });

  it("names an unnamed province after its country", () => {
    expect(parseProvinces(fixture("naturalearth")).find((r) => r.id === "ATA+99?")).toMatchObject({ name: "Antarctica", country: "Antarctica" });
  });

  it("rejects a feature without adm1_code", () => {
    const fc = fixture("naturalearth") as { features: { properties: Record<string, unknown> }[] };
    delete fc.features[0].properties.adm1_code;
    expect(() => parseProvinces(fc)).toThrow();
  });
});

describe("nearestProvince", () => {
  const provinces = parseProvinces(fixture("naturalearth"));

  it("returns the containing province", () => {
    expect(nearestProvince(provinces, 23.7, 38, 150)?.id).toBe("GRC-2884");
  });

  it("else the nearest within maxKm, else null", () => {
    // 1 degree of latitude, about 111 km, south of the fixture's Attiki box
    expect(nearestProvince(provinces, 23.7, 37.0, 150)?.id).toBe("GRC-2884");
    expect(nearestProvince(provinces, 23.7, 37.0, 50)).toBeNull();
    expect(nearestProvince(provinces, 23.7, 33, 150)).toBeNull();
  });
});

/** A minimal zip writer, so the reader is tested against the format and not against itself. */
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const comp = deflateRawSync(e.data);
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(e.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

describe("unzipEntry", () => {
  it("round-trips an entry found by suffix, read through the central directory", () => {
    const data = Buffer.from('{"hello":"world"}'.repeat(100));
    const z = zip([
      { name: "readme.txt", data: Buffer.from("no") },
      { name: "dir/cliopatria.geojson", data },
    ]);
    expect(unzipEntry(z, ".geojson").equals(data)).toBe(true);
  });

  it("throws when no entry matches", () => {
    expect(() => unzipEntry(zip([{ name: "a.txt", data: Buffer.from("x") }]), ".geojson")).toThrow(/geojson/);
  });
});

describe("regionNamesDoc", () => {
  const mk = (name: string, area: number, from: number, to: number): NewRegion => ({ source: "basemaps", name, from_year: from, to_year: to, area, wikidata: null, west: 0, south: 0, east: 1, north: 1, geojson: "{}" });

  it("lists the larger total area first, shows years, and marks struck names", () => {
    const doc = regionNamesDoc([mk("Small", 10, 100, 200), mk("Big", 500, -300, -101), mk("Big", 300, 1, 99), mk("Struck One", 50, 1000, 1100)], new Set(["Struck One"]));
    expect(doc.indexOf("Big")).toBeLessThan(doc.indexOf("Struck One"));
    expect(doc.indexOf("Struck One")).toBeLessThan(doc.indexOf("Small"));
    expect(doc).toContain("300 BCE to 99 CE");
    expect(doc).toMatch(/Struck One.*STRUCK/);
    expect(doc).not.toMatch(/Small.*STRUCK/);
  });

  it("ignores Cliopatria rows, which cannot be struck", () => {
    const clio: NewRegion = { ...mk("Roman Empire", 9e9, -27, 476), source: "cliopatria" };
    const doc = regionNamesDoc([mk("Persian Empire", 5, -500, -400), clio], new Set());
    expect(doc).not.toContain("Roman Empire");
    expect(doc).toContain("1 distinct names");
  });
});
