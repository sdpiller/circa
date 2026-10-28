import { describe, expect, it } from "vitest";
import { ordinal, region } from "../etl/audit.ts";

describe("region boxes", () => {
  const cases: [string, number, number, string][] = [
    ["Athens", 37.98, 23.73, "Europe"],
    ["Crete (Knossos)", 35.3, 25.16, "Europe"],
    ["Syracuse, Sicily", 37.07, 15.29, "Europe"],
    ["Malaga", 36.72, -4.42, "Europe"],
    ["Moscow", 55.75, 37.62, "Europe"],
    ["Tunis (Carthage)", 36.85, 10.32, "North Africa"],
    ["Tangier", 35.77, -5.8, "North Africa"],
    ["Cairo", 30.04, 31.24, "North Africa"],
    ["Jerusalem", 31.77, 35.21, "Anatolia and Middle East"],
    ["Istanbul", 41.01, 28.98, "Anatolia and Middle East"],
    ["Babylon", 32.54, 44.42, "Anatolia and Middle East"],
    ["Timbuktu", 16.77, -3.0, "Sub-Saharan Africa"],
    ["Great Zimbabwe", -20.27, 30.93, "Sub-Saharan Africa"],
    ["Delhi", 28.61, 77.21, "South Asia"],
    ["Samarkand", 39.65, 66.96, "Russia, Central and North Asia"],
    ["Xi'an", 34.34, 108.94, "East Asia"],
    ["Kyoto", 35.01, 135.77, "East Asia"],
    ["Hanoi", 21.03, 105.85, "Southeast Asia and Oceania"],
    ["Angkor", 13.41, 103.87, "Southeast Asia and Oceania"],
    ["Sydney", -33.87, 151.21, "Southeast Asia and Oceania"],
    ["Teotihuacan", 19.69, -98.84, "Americas north of 15°N"],
    ["Cusco", -13.53, -71.97, "Americas south of 15°N"],
  ];
  for (const [name, lat, lon, want] of cases) {
    it(`${name} is in ${want}`, () => expect(region(lat, lon)).toBe(want));
  }
});

describe("ordinal", () => {
  it("handles teens and the usual suffixes", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 35].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "35th"]);
  });
});
