import { describe, expect, it } from "vitest";
import { EVENTS_STEP, OTHERS_STEP } from "../lib/box.ts";
import type { AreaAnswer } from "../lib/db/area.ts";
import type { Position } from "../lib/geo/geometry.ts";
import { areaReducer, initialArea, outlineOf, requestUrl, shownAnswer, tweenRange, type AreaAction, type AreaState } from "../lib/selection.ts";

const ATHENS: Position = [23.72, 37.98];
const THESSALY: Position = [22.4, 39.6];
const CLASSICAL = { from: -500, to: -300 };
const ROMAN = { from: -27, to: 476 };

function answer(over: Partial<AreaAnswer> = {}): AreaAnswer {
  return {
    selection: {
      kind: "historical",
      name: "Greek city-states",
      source: "basemaps",
      areaKm2: 130000,
      capped: false,
      provinceIds: ["GRC-1"],
      fill: { type: "MultiPolygon", coordinates: [] },
      lines: { type: "MultiLineString", coordinates: [] },
      bounds: [20, 35, 28, 42],
      openChains: 0,
    },
    storyId: null,
    from: CLASSICAL.from,
    to: CLASSICAL.to,
    events: [],
    eventsTotal: 0,
    others: [],
    othersTotal: 0,
    ...over,
  };
}

const run = (actions: AreaAction[], from: AreaState = initialArea) => actions.reduce(areaReducer, from);
/** A dispatch of the answer to whatever the state is asking for right now. */
const answered = (s: AreaState, body: AreaAnswer | null = answer()) => areaReducer(s, { type: "answered", url: requestUrl(s)!, body });
const clicked = (point: Position = ATHENS) => answered(run([{ type: "click", point }]));

describe("initialArea", () => {
  it("opens on classical Greece with nothing selected and nothing to ask", () => {
    expect(initialArea.range).toEqual(CLASSICAL);
    expect(initialArea.point).toBeNull();
    expect(requestUrl(initialArea)).toBeNull();
  });
});

describe("click", () => {
  it("stores the point, sets intent click, and asks by that point", () => {
    const s = run([{ type: "click", point: ATHENS }]);
    expect(s.point).toEqual(ATHENS);
    expect(s.intent).toBe("click");
    expect(requestUrl(s)).toBe("/api/area?lat=37.98&lon=23.72&from=-500&to=-300&intent=click&eventsLimit=25&othersLimit=30");
  });

  it("resets the limits and keeps the old answer out of view", () => {
    const before = run([{ type: "more", list: "events", next: 50 }, { type: "more", list: "others", next: 60 }], clicked());
    const s = areaReducer(before, { type: "click", point: THESSALY });
    expect([s.eventsLimit, s.othersLimit]).toEqual([EVENTS_STEP, OTHERS_STEP]);
    expect(requestUrl(s)).not.toBe(s.answer?.url);
    expect(shownAnswer(s)).toBeNull();
  });
});

describe("answered", () => {
  it("ignores a late answer to a request nobody is waiting for", () => {
    const click = run([{ type: "click", point: ATHENS }]);
    const late = requestUrl(click)!;
    const dragged = areaReducer(click, { type: "drag", range: ROMAN });
    const s = areaReducer(dragged, { type: "answered", url: late, body: answer({ storyId: "athens" }) });
    expect(s).toBe(dragged);
    expect(s.range).toEqual(ROMAN);
    expect(shownAnswer(s)).toBeNull();
  });

  it("follows a click that moved the range, and stores it where no second fetch fires", () => {
    const click = run([{ type: "drag", range: { from: -480, to: -320 } }, { type: "click", point: ATHENS }]);
    const s = answered(click, answer({ storyId: "athens", from: -500, to: -300 }));
    expect(s.range).toEqual(CLASSICAL);
    expect(s.intent).toBe("range");
    expect(s.answer?.url).toBe(requestUrl(s));
    expect(shownAnswer(s)?.body?.storyId).toBe("athens");
  });

  it("clears the point and answer on open water, and a later drag asks for nothing", () => {
    const water = answer({ selection: { kind: "none" } });
    const s = answered(run([{ type: "click", point: [-30, 30] }]), water);
    expect(s.point).toBeNull();
    expect(s.answer).toBeNull();
    expect(requestUrl(areaReducer(s, { type: "drag", range: ROMAN }))).toBeNull();
  });

  it("keeps a failed answer, so the panel can say so and the same request is not sent again", () => {
    const s = answered(run([{ type: "click", point: ATHENS }]), null);
    expect(s.answer).toEqual({ url: requestUrl(s), body: null });
    expect(shownAnswer(s)?.body).toBeNull();
    expect(s.point).toEqual(ATHENS);
  });
});

describe("a failed show more", () => {
  const more = (s: AreaState) => areaReducer(s, { type: "more", list: "events", next: 50 });

  it("keeps the list and the old limits, so nothing is asked again", () => {
    const before = clicked();
    const s = answered(more(before), null);
    expect(shownAnswer(s)?.body).not.toBeNull();
    expect(s.answer).toBe(before.answer);
    expect([s.eventsLimit, s.othersLimit]).toEqual([EVENTS_STEP, OTHERS_STEP]);
    expect(requestUrl(s)).toBe(before.answer?.url);
  });

  it("still gives the error when the first load failed", () => {
    const s = answered(run([{ type: "click", point: ATHENS }]), null);
    expect(shownAnswer(s)?.body).toBeNull();
  });

  it("can be tried again, and the longer list then shows", () => {
    const failed = answered(more(clicked()), null);
    const retry = more(failed);
    expect(requestUrl(retry)).not.toBe(failed.answer?.url);
    const s = answered(retry, answer({ eventsTotal: 80 }));
    expect(shownAnswer(s)?.body?.eventsTotal).toBe(80);
    expect(s.eventsLimit).toBe(50);
  });
});

describe("drag", () => {
  it("sets intent range and keeps the point, and the old years are out of view", () => {
    const s = areaReducer(clicked(), { type: "drag", range: ROMAN });
    expect(s.intent).toBe("range");
    expect(s.point).toEqual(ATHENS);
    expect(s.range).toEqual(ROMAN);
    expect(requestUrl(s)).toContain("intent=range");
    expect(shownAnswer(s)).toBeNull();
  });

  it("only moves the range when nothing is selected", () => {
    const s = areaReducer(initialArea, { type: "drag", range: ROMAN });
    expect(s.range).toEqual(ROMAN);
    expect(requestUrl(s)).toBeNull();
  });
});

describe("choose", () => {
  it("sets the point, the exact range and intent range", () => {
    const s = areaReducer(clicked(THESSALY), { type: "choose", point: ATHENS, range: ROMAN });
    expect(s.point).toEqual(ATHENS);
    expect(s.range).toEqual(ROMAN);
    expect(s.intent).toBe("range");
    expect(requestUrl(s)).toContain("intent=range");
    expect(shownAnswer(s)).toBeNull();
  });

  it("resets the limits, as a click does", () => {
    const before = areaReducer(clicked(THESSALY), { type: "more", list: "events", next: 50 });
    expect(areaReducer(before, { type: "choose", point: ATHENS, range: ROMAN }).eventsLimit).toBe(EVENTS_STEP);
  });
});

describe("more", () => {
  it("raises one limit and keeps the list on screen while the longer one loads", () => {
    const before = clicked();
    const s = areaReducer(before, { type: "more", list: "others", next: 60 });
    expect([s.eventsLimit, s.othersLimit]).toEqual([EVENTS_STEP, 60]);
    expect(requestUrl(s)).not.toBe(s.answer?.url);
    expect(shownAnswer(s)).toBe(before.answer);
  });
});

describe("close", () => {
  it("clears the point and answer and keeps the range", () => {
    const s = areaReducer(areaReducer(clicked(), { type: "drag", range: ROMAN }), { type: "close" });
    expect(s.point).toBeNull();
    expect(s.answer).toBeNull();
    expect(s.range).toEqual(ROMAN);
    expect(requestUrl(s)).toBeNull();
  });

  it("makes the answer to a pending request a no-op", () => {
    const click = run([{ type: "click", point: ATHENS }]);
    const closed = areaReducer(click, { type: "close" });
    expect(areaReducer(closed, { type: "answered", url: requestUrl(click)!, body: answer() })).toBe(closed);
  });
});

describe("outlineOf", () => {
  it("is null with nothing selected, while a new click loads, and after an error", () => {
    expect(outlineOf(initialArea)).toBeNull();
    expect(outlineOf(areaReducer(clicked(), { type: "click", point: THESSALY }))).toBeNull();
    expect(outlineOf(answered(run([{ type: "click", point: ATHENS }]), null))).toBeNull();
  });

  it("flies on a new selection's answer, including when the answer moved the range", () => {
    expect(outlineOf(clicked())?.fly).toBe(true);
    const moved = answered(run([{ type: "click", point: ATHENS }]), answer({ from: -500, to: -300, storyId: "athens" }));
    expect(outlineOf(moved)?.fly).toBe(true);
    const chosen = answered(run([{ type: "choose", point: ATHENS, range: CLASSICAL }]));
    expect(outlineOf(chosen)?.fly).toBe(true);
  });

  it("keeps the shown outline while a dragged range loads, without flying, then swaps it", () => {
    const first = clicked();
    const dragging = areaReducer(first, { type: "drag", range: ROMAN });
    expect(outlineOf(dragging)?.key).toBe(outlineOf(first)?.key);
    const s = answered(dragging, answer(ROMAN));
    expect(outlineOf(s)?.fly).toBe(false);
    expect(outlineOf(s)?.key).not.toBe(outlineOf(first)?.key);
  });

  it("still flies when the range moved before the click's first answer arrived", () => {
    const s = run([{ type: "click", point: ATHENS }, { type: "drag", range: ROMAN }]);
    expect(outlineOf(answered(s, answer(ROMAN)))?.fly).toBe(true);
  });

  it("keeps its key through show more, so the camera and the outline stay put", () => {
    const first = clicked();
    const s = answered(areaReducer(first, { type: "more", list: "events", next: 50 }));
    expect(outlineOf(s)?.key).toBe(outlineOf(first)?.key);
  });

  it("gives two clicks in the same region different keys", () => {
    expect(outlineOf(clicked(ATHENS))?.key).not.toBe(outlineOf(clicked(THESSALY))?.key);
  });
});

describe("tweenRange", () => {
  const steps = Array.from({ length: 101 }, (_, i) => i / 100);

  it("is the first range at 0 and the second at 1", () => {
    expect(tweenRange(CLASSICAL, ROMAN, 0)).toEqual(CLASSICAL);
    expect(tweenRange(CLASSICAL, ROMAN, 1)).toEqual(ROMAN);
  });

  it("counts in astronomical years: halfway from 2 BCE to 1 CE is 1 BCE", () => {
    expect(tweenRange({ from: -2, to: -2 }, { from: 1, to: 1 }, 0.5)).toEqual({ from: -1, to: -1 });
  });

  it("never returns year 0 from -100 to 100, in whole years, whichever end moves", () => {
    const ranges = [
      [{ from: -100, to: -100 }, { from: 100, to: 100 }],
      [{ from: -100, to: 100 }, { from: 100, to: 100 }],
      [{ from: -100, to: -100 }, { from: -100, to: 100 }],
    ];
    for (const [a, b] of ranges)
      for (const t of steps) {
        const { from, to } = tweenRange(a, b, t);
        for (const year of [from, to]) {
          expect(year).not.toBe(0);
          expect(Number.isInteger(year)).toBe(true);
        }
      }
  });

  it("keeps the start no later than the end all the way", () => {
    for (const t of steps) {
      const { from, to } = tweenRange({ from: -2500, to: -500 }, { from: 750, to: 1260 }, t);
      expect(from).toBeLessThanOrEqual(to);
    }
  });
});
