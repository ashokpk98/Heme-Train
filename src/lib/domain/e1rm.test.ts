import { describe, expect, it } from "vitest";
import {
  estimate1rm,
  estimate1rmConsensus,
  isReliable,
  loadForReps,
  trainingMaxFrom,
} from "./e1rm";

describe("estimate1rm", () => {
  it("is exact at a true single for every formula", () => {
    expect(estimate1rm(150, 1, "epley")).toBe(150);
    expect(estimate1rm(150, 1, "brzycki")).toBe(150);
    expect(estimate1rm(150, 1, "lombardi")).toBe(150);
  });

  it("computes Epley", () => {
    // 100 x 5 -> 100 * (1 + 5/30) = 116.67
    expect(estimate1rm(100, 5, "epley")).toBeCloseTo(116.667, 3);
  });

  it("computes Brzycki", () => {
    // 100 x 5 -> 100 * 36 / 32 = 112.5
    expect(estimate1rm(100, 5, "brzycki")).toBeCloseTo(112.5, 3);
  });

  it("computes Lombardi", () => {
    // 100 x 5 -> 100 * 5^0.1 = 117.46
    expect(estimate1rm(100, 5, "lombardi")).toBeCloseTo(117.462, 3);
  });

  it("returns null for Brzycki at its singularity", () => {
    expect(estimate1rm(100, 37, "brzycki")).toBeNull();
    expect(estimate1rm(100, 40, "brzycki")).toBeNull();
  });

  it("rejects unusable input rather than returning nonsense", () => {
    expect(estimate1rm(0, 5)).toBeNull();
    expect(estimate1rm(-100, 5)).toBeNull();
    expect(estimate1rm(100, 0)).toBeNull();
    expect(estimate1rm(Number.NaN, 5)).toBeNull();
  });

  it("averages the formulas for a consensus estimate", () => {
    const consensus = estimate1rmConsensus(100, 5)!;
    expect(consensus).toBeGreaterThan(112);
    expect(consensus).toBeLessThan(118);
  });

  it("flags rep counts where estimates stop holding up", () => {
    expect(isReliable(5)).toBe(true);
    expect(isReliable(12)).toBe(true);
    expect(isReliable(20)).toBe(false);
  });
});

describe("loadForReps", () => {
  it("round-trips against estimate1rm", () => {
    const oneRm = estimate1rm(100, 5, "epley")!;
    expect(loadForReps(oneRm, 5, "epley")).toBeCloseTo(100, 6);
  });

  it("returns the max itself for a single", () => {
    expect(loadForReps(200, 1)).toBe(200);
  });
});

describe("trainingMaxFrom", () => {
  it("defaults to the Wendler-standard 90%", () => {
    expect(trainingMaxFrom(200)).toBe(180);
  });

  it("accepts a custom factor", () => {
    expect(trainingMaxFrom(200, 0.85)).toBe(170);
  });
});
