import { describe, it, expect } from "vitest";
import { validateConfig, MAX_AUDIENCE, MAX_HATER_INTENSITY, type AudienceConfig } from "@/lib/audience";

const base: AudienceConfig = { size: 50, lovers: 10, haters: 5, intensity: 2, stones: true };

describe("audience config validation", () => {
  it("computes neutral as the remainder", () => {
    expect(validateConfig(base)).toEqual({ ok: true, neutral: 35 });
  });
  it("rejects lovers + haters exceeding size", () => {
    expect(validateConfig({ ...base, size: 20, lovers: 15, haters: 6 }).ok).toBe(false);
  });
  it("allows lovers + haters equal to size", () => {
    expect(validateConfig({ ...base, size: 20, lovers: 10, haters: 10 })).toEqual({ ok: true, neutral: 0 });
  });
  it("rejects negative counts", () => {
    expect(validateConfig({ ...base, size: 20, lovers: -1, haters: 0 }).ok).toBe(false);
  });
  it("allows an audience of 300 and rejects 301", () => {
    expect(MAX_AUDIENCE).toBe(300);
    expect(validateConfig({ ...base, size: 300 }).ok).toBe(true);
    expect(validateConfig({ ...base, size: 301 }).ok).toBe(false);
  });
  it("rejects hater intensity outside 0–3", () => {
    expect(MAX_HATER_INTENSITY).toBe(3);
    expect(validateConfig({ ...base, intensity: 4 }).ok).toBe(false);
    expect(validateConfig({ ...base, intensity: 0 }).ok).toBe(true);
  });
});
