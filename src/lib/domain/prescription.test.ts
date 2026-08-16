import { describe, expect, it } from "vitest";
import {
  type ExerciseContext,
  type ResolutionContext,
  resolveSet,
  roundToIncrement,
  volumeLoad,
} from "./prescription";

const BACK_SQUAT_ID = "back-squat";
const FRONT_SQUAT_ID = "front-squat";
const PLANK_ID = "plank";

const backSquat: ExerciseContext = {
  id: BACK_SQUAT_ID,
  loadBasis: "own_1rm",
  trackedMetrics: ["load", "reps", "rpe", "velocity", "tempo"],
};

/** Front squat is programmed as a percentage of the back squat max. */
const frontSquat: ExerciseContext = {
  id: FRONT_SQUAT_ID,
  loadBasis: "derived_from_exercise",
  derivedFromExerciseId: BACK_SQUAT_ID,
  derivedRatio: 0.85,
  trackedMetrics: ["load", "reps", "rpe"],
};

const plank: ExerciseContext = {
  id: PLANK_ID,
  loadBasis: "bodyweight",
  trackedMetrics: ["time"],
};

const ctx: ResolutionContext = {
  maxes: {
    [BACK_SQUAT_ID]: { oneRepMaxKg: 110 },
  },
  bodyweightKg: 82,
  plateIncrementKg: 2.5,
};

describe("roundToIncrement", () => {
  it("rounds to the nearest achievable plate jump", () => {
    expect(roundToIncrement(83.1, 2.5)).toBe(82.5);
    expect(roundToIncrement(84, 2.5)).toBe(85);
    expect(roundToIncrement(95.2, 2.5)).toBe(95);
  });

  it("passes the load through when the increment is unusable", () => {
    expect(roundToIncrement(83.1, 0)).toBe(83.1);
  });
});

describe("resolveSet — percentage loading", () => {
  it("resolves 75% of a 110 kg max to 82.5 kg", () => {
    const r = resolveSet(
      { reps: 5, loadPercent: 75, percentOf: "1rm" },
      backSquat,
      ctx,
    );
    expect(r.loadKg).toBe(82.5);
    expect(r.loadSource).toBe("percent_1rm");
    expect(r.unresolvedReason).toBeNull();
    expect(r.displayText).toContain("82.5 kg");
  });

  it("falls back to 90% of 1RM when no training max is stored", () => {
    const r = resolveSet(
      { reps: 5, loadPercent: 100, percentOf: "training_max" },
      backSquat,
      ctx,
    );
    // 110 * 0.9 = 99 -> rounds to 100 at 2.5 kg increments
    expect(r.loadKg).toBe(100);
    expect(r.loadSource).toBe("percent_training_max");
  });

  it("uses an explicitly stored training max over the fallback", () => {
    const r = resolveSet(
      { reps: 5, loadPercent: 100, percentOf: "training_max" },
      backSquat,
      {
        ...ctx,
        maxes: { [BACK_SQUAT_ID]: { oneRepMaxKg: 110, trainingMaxKg: 105 } },
      },
    );
    expect(r.loadKg).toBe(105);
  });

  it("lets an explicit absolute load override a percentage", () => {
    const r = resolveSet(
      { reps: 5, loadKg: 100, loadPercent: 75 },
      backSquat,
      ctx,
    );
    expect(r.loadKg).toBe(100);
    expect(r.loadSource).toBe("absolute");
  });
});

describe("resolveSet — derived from another lift", () => {
  it("reads the source lift's max and applies the ratio", () => {
    const r = resolveSet(
      { reps: 3, loadPercent: 80, percentOf: "1rm" },
      frontSquat,
      { ...ctx, maxes: { [BACK_SQUAT_ID]: { oneRepMaxKg: 140 } } },
    );
    // 140 * 0.85 = 119 reference; 119 * 0.80 = 95.2 -> 95 kg
    expect(r.loadKg).toBe(95);
    expect(r.loadSource).toBe("derived_from_exercise");
  });

  it("degrades when the source lift has no max on file", () => {
    const r = resolveSet({ reps: 3, loadPercent: 80 }, frontSquat, {
      maxes: {},
      plateIncrementKg: 2.5,
    });
    expect(r.loadKg).toBeNull();
    expect(r.unresolvedReason).toBe("no_max_recorded");
  });
});

describe("resolveSet — all four prescription methods on one set", () => {
  it("keeps load, RPE, velocity and tempo together", () => {
    const r = resolveSet(
      {
        reps: 5,
        loadPercent: 80,
        percentOf: "1rm",
        rpeTarget: 8,
        velocityTargetMin: 0.45,
        velocityLossThresholdPct: 20,
        tempo: "3-1-X-0",
        restSeconds: 180,
      },
      backSquat,
      ctx,
    );

    // 110 * 0.80 = 88 -> rounds to 87.5
    expect(r.loadKg).toBe(87.5);
    expect(r.volumeText).toBe("5");
    expect(r.intensityText).toContain("RPE 8");
    expect(r.intensityText).toContain("≥ 0.45 m/s");
    expect(r.intensityText).toContain("stop at 20% vel. loss");
    expect(r.intensityText).toContain("tempo 3-1-X-0");
    expect(r.restText).toBe("rest 3min");

    // The whole prescription survives into one readable line.
    expect(r.displayText).toContain("87.5 kg");
    expect(r.displayText).toContain("RPE 8");
    expect(r.displayText).toContain("3-1-X-0");
  });
});

describe("resolveSet — graceful degradation", () => {
  it("shows the coach's intent when no max exists", () => {
    const r = resolveSet({ reps: 5, loadPercent: 80, rpeTarget: 8 }, backSquat, {
      maxes: {},
    });
    expect(r.loadKg).toBeNull();
    expect(r.unresolvedReason).toBe("no_max_recorded");
    expect(r.loadText).toBe("— (80%)");
    // Reps and RPE still render, so a program is buildable before any testing.
    expect(r.displayText).toContain("5");
    expect(r.displayText).toContain("RPE 8");
  });

  it("does not throw on a completely empty prescription", () => {
    const r = resolveSet({}, backSquat, { maxes: {} });
    expect(r.loadKg).toBeNull();
    expect(r.displayText).toBe("—");
  });
});

describe("resolveSet — tracked metrics drive the output", () => {
  it("renders time and no weight field for a time-based exercise", () => {
    const r = resolveSet({ durationSec: 45 }, plank, ctx);
    expect(r.volumeText).toBe("45s");
    // `plank` does not track load, so no weight is shown even though the
    // athlete's bodyweight is known.
    expect(r.loadText).toBe("");
    expect(r.displayText).toBe("45s");
  });

  it("formats rep ranges and AMRAP sets", () => {
    expect(resolveSet({ repMin: 8, repMax: 12 }, backSquat, ctx).volumeText).toBe(
      "8-12",
    );
    expect(
      resolveSet({ reps: 5, isAmrap: true }, backSquat, ctx).volumeText,
    ).toBe("5+");
  });
});

describe("resolveSet — units", () => {
  it("converts to pounds for display without changing the stored kg", () => {
    const r = resolveSet({ reps: 5, loadKg: 100 }, backSquat, {
      ...ctx,
      unit: "lb",
    });
    expect(r.loadKg).toBe(100);
    expect(r.loadDisplay).toBeCloseTo(220.5, 1);
    expect(r.loadText).toContain("lb");
  });
});

describe("volumeLoad", () => {
  it("multiplies reps by load", () => {
    expect(volumeLoad(5, 100)).toBe(500);
  });

  it("treats unresolved sets as zero rather than NaN", () => {
    expect(volumeLoad(5, null)).toBe(0);
    expect(volumeLoad(null, 100)).toBe(0);
  });
});
