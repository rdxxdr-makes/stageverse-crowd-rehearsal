import { describe, it, expect } from "vitest";
import { validateConfig } from "@/lib/audience";

describe("audience config validation", () => {
  it("computes neutral as the remainder", () => {
    expect(validateConfig({ size: 50, lovers: 10, haters: 5 })).toEqual({ ok: true, neutral: 35 });
  });
  it("rejects lovers + haters exceeding size", () => {
    expect(validateConfig({ size: 20, lovers: 15, haters: 6 }).ok).toBe(false);
  });
  it("allows lovers + haters equal to size", () => {
    expect(validateConfig({ size: 20, lovers: 10, haters: 10 })).toEqual({ ok: true, neutral: 0 });
  });
  it("rejects negative counts", () => {
    expect(validateConfig({ size: 20, lovers: -1, haters: 0 }).ok).toBe(false);
  });
});
