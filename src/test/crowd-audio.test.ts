import { describe, expect, it } from "vitest";
import { tuneMix } from "@/lib/crowd-audio";

describe("tuneMix", () => {
  it("hater-heavy crowds hear mostly the aggressive tune", () => {
    const m = tuneMix(5, 40);
    expect(m.hater).toBeGreaterThan(0.8);
    expect(m.lover).toBeLessThan(0.2);
  });

  it("lover-heavy crowds hear mostly the uplifting tune", () => {
    const m = tuneMix(60, 10);
    expect(m.lover).toBeGreaterThan(0.8);
    expect(m.hater).toBeLessThan(0.2);
  });

  it("balanced crowds blend both tunes evenly", () => {
    const m = tuneMix(10, 10);
    expect(m.lover).toBeCloseTo(0.5);
    expect(m.hater).toBeCloseTo(0.5);
  });

  it("no lovers or haters falls back to an even blend", () => {
    expect(tuneMix(0, 0)).toEqual({ lover: 0.5, hater: 0.5 });
  });
});
