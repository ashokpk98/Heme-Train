import { describe, expect, it } from "vitest";
import {
  presetById,
  progressSet,
  projectAcrossWeeks,
  type ProgressionRule,
} from "./progression";

describe("progressSet", () => {
  it("returns week 0 unchanged", () => {
    const set = { reps: 5, loadKg: 100 };
    const rule: ProgressionRule = { kind: "linear_absolute", incrementKg: 2.5 };
    expect(progressSet(set, rule, 0)).toEqual(set);
  });

  it("does not mutate the input set", () => {
    const set = { reps: 5, loadKg: 100 };
    progressSet(set, { kind: "linear_absolute", incrementKg: 2.5 }, 3);
    expect(set.loadKg).toBe(100);
  });

  it("adds absolute load linearly", () => {
    const set = { reps: 5, loadKg: 100 };
    const rule: ProgressionRule = { kind: "linear_absolute", incrementKg: 2.5 };
    expect(progressSet(set, rule, 1).loadKg).toBe(102.5);
    expect(progressSet(set, rule, 3).loadKg).toBe(107.5);
  });

  it("adds percentage points linearly and caps at 100%", () => {
    const set = { reps: 3, loadPercent: 80 };
    const rule: ProgressionRule = {
      kind: "linear_percent",
      incrementPercent: 5,
    };
    expect(progressSet(set, rule, 2).loadPercent).toBe(90);
    // Week 10 would be 130% — capped.
    expect(progressSet(set, rule, 10).loadPercent).toBe(100);
  });

  it("follows an explicit percentage ramp including the deload week", () => {
    const set = { reps: 5, loadPercent: 70 };
    const rule: ProgressionRule = {
      kind: "percent_ramp",
      weeklyPercents: [70, 75, 80, 65],
    };
    expect(progressSet(set, rule, 1).loadPercent).toBe(75);
    expect(progressSet(set, rule, 2).loadPercent).toBe(80);
    expect(progressSet(set, rule, 3).loadPercent).toBe(65);
  });

  it("holds the last prescription when the ramp runs out", () => {
    const set = { reps: 5, loadPercent: 70 };
    const rule: ProgressionRule = {
      kind: "percent_ramp",
      weeklyPercents: [70, 75],
    };
    expect(progressSet(set, rule, 5).loadPercent).toBe(70);
  });

  it("ramps RPE targets", () => {
    const set = { reps: 5, rpeTarget: 7 };
    const rule: ProgressionRule = { kind: "rpe_ramp", weeklyRpe: [7, 8, 9, 6] };
    expect(progressSet(set, rule, 2).rpeTarget).toBe(9);
    expect(progressSet(set, rule, 3).rpeTarget).toBe(6);
  });

  it("walks the rep range then bumps load on double progression", () => {
    const set = { reps: 8, loadKg: 40 };
    const rule: ProgressionRule = {
      kind: "double_progression",
      repMin: 8,
      repMax: 10,
      incrementKg: 2.5,
    };
    // Cycle 1: 8, 9, 10 reps at 40 kg
    expect(progressSet(set, rule, 0)).toMatchObject({ reps: 8, loadKg: 40 });
    expect(progressSet(set, rule, 1)).toMatchObject({ reps: 9, loadKg: 40 });
    expect(progressSet(set, rule, 2)).toMatchObject({ reps: 10, loadKg: 40 });
    // Cycle 2: back to 8 reps, load up 2.5 kg
    expect(progressSet(set, rule, 3)).toMatchObject({ reps: 8, loadKg: 42.5 });
  });
});

describe("projectAcrossWeeks", () => {
  it("expands one week of sets into a whole block", () => {
    const sets = [
      { reps: 5, loadPercent: 70 },
      { reps: 5, loadPercent: 70 },
    ];
    const weeks = projectAcrossWeeks(
      sets,
      { kind: "percent_ramp", weeklyPercents: [70, 75, 80, 65] },
      4,
    );

    expect(weeks).toHaveLength(4);
    expect(weeks[0].every((s) => s.loadPercent === 70)).toBe(true);
    expect(weeks[1].every((s) => s.loadPercent === 75)).toBe(true);
    expect(weeks[2].every((s) => s.loadPercent === 80)).toBe(true);
    expect(weeks[3].every((s) => s.loadPercent === 65)).toBe(true);
    expect(weeks[2]).toHaveLength(2);
  });

  it("returns nothing for a zero-week projection", () => {
    expect(projectAcrossWeeks([{ reps: 5 }], { kind: "linear_absolute", incrementKg: 2.5 }, 0)).toEqual([]);
  });
});

describe("presets", () => {
  it("exposes the 5/3/1 wave", () => {
    const preset = presetById("wendler_531");
    expect(preset).toBeDefined();
    expect(preset!.rule).toMatchObject({ kind: "percent_ramp" });
  });

  it("returns undefined for an unknown preset", () => {
    expect(presetById("nope")).toBeUndefined();
  });
});
