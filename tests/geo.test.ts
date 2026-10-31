import { describe, expect, it } from "vitest";
import { bboxOf, distanceKm, pointInGeometry, ringAreaKm2 } from "../lib/geo/geometry.ts";
import type { AreaGeometry, Position, Ring } from "../lib/geo/geometry.ts";
import { MIN_PIECE_KM2, NEAR_PIECE_KM, boundaryLines, buildOutline, frameBounds, simplifyRing } from "../lib/geo/outline.ts";

/** A closed square ring from its south-west corner. */
function square(x: number, y: number, size = 1, clockwise = false): Ring {
  const ring: Ring = [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
  return clockwise ? ring.reverse() : ring;
}

const poly = (...rings: Ring[]): AreaGeometry => ({ type: "Polygon", coordinates: rings });
const none: ReadonlySet<string> = new Set();

/** Distinct vertices of a closed ring. */
const corners = (r: Ring) => new Set(r.slice(0, -1).map(([x, y]) => `${x},${y}`));
const isClosed = (r: Ring) => r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];

describe("pointInGeometry", () => {
  const withHole = poly(square(0, 0, 10), square(4, 4, 2));
  const multi: AreaGeometry = { type: "MultiPolygon", coordinates: [[square(0, 0)], [square(10, 10)]] };

  it("is true inside and false outside", () => {
    expect(pointInGeometry(0.5, 0.5, poly(square(0, 0)))).toBe(true);
    expect(pointInGeometry(1.5, 0.5, poly(square(0, 0)))).toBe(false);
  });

  it("is false inside a hole", () => {
    expect(pointInGeometry(1, 1, withHole)).toBe(true);
    expect(pointInGeometry(5, 5, withHole)).toBe(false);
  });

  it("finds the second polygon of a MultiPolygon", () => {
    expect(pointInGeometry(10.5, 10.5, multi)).toBe(true);
    expect(pointInGeometry(5, 5, multi)).toBe(false);
  });
});

describe("distance, area and bounds", () => {
  it("measures a degree of latitude as about 111.2 km", () => {
    expect(Math.abs(distanceKm([0, 0], [0, 1]) - 111.2)).toBeLessThan(1);
  });

  it("measures a one degree square at the equator within 1% of 12,364 km2", () => {
    expect(Math.abs(ringAreaKm2(square(0, 0)) / 12364 - 1)).toBeLessThan(0.01);
  });

  it("gives the bounding box of the outer rings", () => {
    const g: AreaGeometry = { type: "MultiPolygon", coordinates: [[square(0, 0)], [square(10, 20, 2)]] };
    expect(bboxOf(g)).toEqual([0, 0, 12, 22]);
  });
});

describe("buildOutline merging", () => {
  it.each([
    ["both counter-clockwise", false, false],
    ["both clockwise", true, true],
    ["opposite windings", false, true],
  ])("merges two squares sharing an edge into one ring with 6 corners (%s)", (_name, aCw, bCw) => {
    const out = buildOutline(
      [{ id: "a", geometry: poly(square(0, 0, 1, aCw)) }, { id: "b", geometry: poly(square(1, 0, 1, bCw)) }],
      [0.5, 0.5],
      none,
    );
    expect(out.rings).toHaveLength(1);
    expect(isClosed(out.rings[0])).toBe(true);
    expect(corners(out.rings[0])).toEqual(new Set(["0,0", "1,0", "2,0", "2,1", "1,1", "0,1"]));
    expect(out.keptIds.sort()).toEqual(["a", "b"]);
  });

  it("returns closed rings, no open chains, for squares touching only at a corner", () => {
    const out = buildOutline([{ id: "a", geometry: poly(square(0, 0)) }, { id: "b", geometry: poly(square(1, 1)) }], [0.5, 0.5], none);
    expect(out.rings).toHaveLength(2);
    for (const r of out.rings) {
      expect(isClosed(r)).toBe(true);
      expect(corners(r).size).toBe(4);
    }
  });

  it("has no hole ring and counts the hole in the area", () => {
    const big = square(0, 0, 10);
    const out = buildOutline([{ id: "a", geometry: poly(big, square(4, 4, 2)) }], [1, 1], none);
    expect(out.rings).toHaveLength(1);
    expect(out.areaKm2).toBeCloseTo(ringAreaKm2(big), 3);
  });

  it("cancels a province that fills another's hole and keeps it listed", () => {
    const out = buildOutline(
      [{ id: "ring", geometry: poly(square(0, 0, 10), square(4, 4, 2)) }, { id: "core", geometry: poly(square(4, 4, 2)) }],
      [1, 1],
      none,
    );
    expect(out.rings).toHaveLength(1);
    expect(out.keptIds.sort()).toEqual(["core", "ring"]);
  });
});

describe("buildOutline small and far pieces", () => {
  // One degree is about 111 km at the equator.
  const main = { id: "main", geometry: poly(square(0, 0, 2)) };
  const island = (id: string, x: number, size: number) => ({ id, ring: square(x, 0, size), geometry: poly(square(x, 0, size)) });
  const click: Position = [1, 1];

  it("sanity: the constants", () => {
    expect([MIN_PIECE_KM2, NEAR_PIECE_KM]).toEqual([350, 120]);
  });

  it("keeps an island 100 km away and drops one 200 km away", () => {
    // Gaps measured from the main square's east edge at x = 2.
    const near = buildOutline([main, island("near", 2.9, 0.5)], click, none);
    expect(near.keptIds).toEqual(["main", "near"]);
    const far = buildOutline([main, island("far", 3.8, 0.5)], click, none);
    expect(far.keptIds).toEqual(["main"]);
    expect(far.rings).toHaveLength(1);
  });

  it("keeps an island 200 km away when its province is exempt", () => {
    const out = buildOutline([main, island("far", 3.8, 0.5)], click, new Set(["far"]));
    expect(out.keptIds).toEqual(["main", "far"]);
    expect(out.rings).toHaveLength(2);
  });

  it("drops a 100 km2 island unless the click is inside it", () => {
    const tiny = island("tiny", 2.1, 0.09);
    expect(ringAreaKm2(tiny.ring)).toBeLessThan(MIN_PIECE_KM2);
    expect(buildOutline([main, tiny], click, none).keptIds).toEqual(["main"]);
    const clicked = buildOutline([main, tiny], [2.15, 0.05], none);
    expect(clicked.keptIds).toEqual(["main", "tiny"]);
  });

  it("omits a province whose only piece was dropped", () => {
    const out = buildOutline([main, island("far", 3.8, 0.5)], click, none);
    expect(out.keptIds).not.toContain("far");
  });

  it("takes the nearest ring as the clicked piece when the click is in none", () => {
    // Click in the sea between the two squares, closer to the right one; the left one is 150 km from it.
    const left = { id: "left", geometry: poly(square(0, 0, 2)) };
    const right = { id: "right", geometry: poly(square(3.4, 0, 2)) };
    const out = buildOutline([left, right], [3.2, 1], none);
    // The right square is the clicked piece, so it stays; the left is 1.4 degrees (155 km) away, so it goes.
    expect(out.keptIds).toEqual(["right"]);
  });
});

describe("simplifyRing", () => {
  it("keeps first and last equal and the corners of a square with a near-collinear vertex", () => {
    const ring: Ring = [[0, 0], [5, 0.001], [10, 0], [10, 10], [0, 10], [0, 0]];
    const out = simplifyRing(ring, 0.01);
    expect(out[0]).toEqual(out[out.length - 1]);
    expect(corners(out)).toEqual(new Set(["0,0", "10,0", "10,10", "0,10"]));
  });
});

describe("boundaryLines", () => {
  it("omits segments lying along the antimeridian and splits the ring there", () => {
    const east: Ring = [[170, 0], [180, 0], [180, 10], [170, 10], [170, 0]];
    const west: Ring = [[-180, 0], [-170, 0], [-170, 10], [-180, 10], [-180, 0]];
    const lines = boundaryLines([east, west]);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const along = (line[i][0] === 180 && line[i + 1][0] === 180) || (line[i][0] === -180 && line[i + 1][0] === -180);
        expect(along).toBe(false);
      }
    }
  });

  it("returns a ring away from the antimeridian whole", () => {
    expect(boundaryLines([square(0, 0)])).toEqual([square(0, 0)]);
  });
});

describe("frameBounds", () => {
  it("unwraps a shape over the antimeridian to east above 180", () => {
    const east: Ring = [[175, 0], [180, 0], [180, 5], [175, 5], [175, 0]];
    const west: Ring = [[-180, 0], [-170, 0], [-170, 5], [-180, 5], [-180, 0]];
    expect(frameBounds([east, west], 178)).toEqual([175, 0, 190, 5]);
  });
});
