import { describe, expect, it } from "vitest";
import { formatRange, historicalToAstronomical, MAX_YEAR, MIN_YEAR, SLIDER_STEPS, sliderToYear, yearToSlider } from "../lib/time/index.ts";

const positions = Array.from({ length: SLIDER_STEPS + 1 }, (_, p) => p);

describe("range slider scale", () => {
  it("spans the data window exactly", () => {
    expect(sliderToYear(0)).toBe(MIN_YEAR);
    expect(sliderToYear(SLIDER_STEPS)).toBe(MAX_YEAR);
  });

  it("never produces year 0", () => {
    expect(positions.map(sliderToYear)).not.toContain(0);
  });

  it("crosses from BCE to CE without losing or doubling a year (1 BCE is directly before 1 CE)", () => {
    const span = (a: number, b: number) => historicalToAstronomical(b) - historicalToAstronomical(a);
    const years = positions.map(sliderToYear);
    const i = years.findIndex((y) => y > 0);
    expect(years[i - 1]).toBeLessThan(0);
    // The step across the boundary is the same size as its neighbours (5 years per step here).
    expect(span(years[i - 1], years[i])).toBe(span(years[i - 2], years[i - 1]));
    expect(span(years[i - 1], years[i])).toBe(span(years[i], years[i + 1]));
  });

  it("is monotonic", () => {
    const years = positions.map(sliderToYear);
    for (let i = 1; i < years.length; i++) expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
  });

  it("gives recent centuries more resolution than deep antiquity", () => {
    const yearsPerStep = (from: number, to: number) => (sliderToYear(to) - sliderToYear(from)) / (to - from);
    expect(yearsPerStep(0, 200)).toBeGreaterThan(10);
    expect(yearsPerStep(800, 1000)).toBeLessThan(2);
  });

  it("places a year at the position that maps back to it, within one step's worth of years", () => {
    for (const y of [-3500, -2000, -490, -27, -1, 1, 79, 476, 1066, 1453, 1914, 2026]) {
      const back = sliderToYear(yearToSlider(y));
      const step = Math.abs(sliderToYear(yearToSlider(y) + 1) - sliderToYear(yearToSlider(y) - 1));
      expect(Math.abs(back - y)).toBeLessThanOrEqual(step);
    }
  });

  it("clamps out-of-range input", () => {
    expect(sliderToYear(-5)).toBe(MIN_YEAR);
    expect(sliderToYear(SLIDER_STEPS + 5)).toBe(MAX_YEAR);
    expect(yearToSlider(-9000)).toBe(0);
    expect(yearToSlider(3000)).toBe(SLIDER_STEPS);
  });
});

describe("formatRange", () => {
  it("shows a single year once and a span with both ends", () => {
    expect(formatRange(-490, -490)).toBe("490 BCE");
    expect(formatRange(-500, -401)).toBe("500 BCE to 401 BCE");
  });
});
