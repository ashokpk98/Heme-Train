/**
 * Estimated 1RM (e1RM) formulas.
 *
 * Used to derive a max from a submaximal set, so a coach never has to test a
 * true single to program percentages. Every formula is exact at 1 rep and
 * loses accuracy as reps climb — see `isReliable`.
 */

export type E1rmFormula = "epley" | "brzycki" | "lombardi";

export const E1RM_FORMULAS: readonly E1rmFormula[] = [
  "epley",
  "brzycki",
  "lombardi",
];

/** Beyond this rep count, e1RM estimates diverge sharply between formulas. */
export const RELIABLE_REP_LIMIT = 12;

/**
 * Estimate a 1RM from a load lifted for a number of reps.
 *
 * @param loadKg Weight lifted.
 * @param reps   Reps completed at that weight (must be >= 1).
 * @returns Estimated 1RM in kg, or null when inputs are unusable.
 */
export function estimate1rm(
  loadKg: number,
  reps: number,
  formula: E1rmFormula = "epley",
): number | null {
  if (!Number.isFinite(loadKg) || !Number.isFinite(reps)) return null;
  if (loadKg <= 0 || reps < 1) return null;

  // Every formula is exact at a true single; Epley's raw form is not, so the
  // identity is applied explicitly rather than letting it drift 3% high.
  if (reps === 1) return loadKg;

  switch (formula) {
    case "epley":
      return loadKg * (1 + reps / 30);
    case "brzycki":
      // Denominator hits zero at 37 reps; the formula is meaningless there.
      if (reps >= 37) return null;
      return (loadKg * 36) / (37 - reps);
    case "lombardi":
      return loadKg * Math.pow(reps, 0.1);
  }
}

/**
 * Average the formulas that produce a usable value. More stable than trusting
 * any single one, which is what most coaches do by eye anyway.
 */
export function estimate1rmConsensus(
  loadKg: number,
  reps: number,
): number | null {
  const values = E1RM_FORMULAS.map((f) => estimate1rm(loadKg, reps, f)).filter(
    (v): v is number => v !== null,
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Whether a rep count is inside the range where e1RM estimates hold up. */
export function isReliable(reps: number): boolean {
  return reps >= 1 && reps <= RELIABLE_REP_LIMIT;
}

/**
 * Inverse of `estimate1rm`: the load predicted to be achievable for a given
 * number of reps. Used to seed prescriptions from a known max.
 */
export function loadForReps(
  oneRepMaxKg: number,
  reps: number,
  formula: E1rmFormula = "epley",
): number | null {
  if (!Number.isFinite(oneRepMaxKg) || oneRepMaxKg <= 0) return null;
  if (!Number.isFinite(reps) || reps < 1) return null;
  if (reps === 1) return oneRepMaxKg;

  switch (formula) {
    case "epley":
      return oneRepMaxKg / (1 + reps / 30);
    case "brzycki":
      if (reps >= 37) return null;
      return (oneRepMaxKg * (37 - reps)) / 36;
    case "lombardi":
      return oneRepMaxKg / Math.pow(reps, 0.1);
  }
}

/**
 * Percentage of 1RM that a given rep count represents, per the chosen formula.
 * Handy for showing coaches "5 reps ≈ 86% of max" while they program.
 */
export function percentForReps(
  reps: number,
  formula: E1rmFormula = "epley",
): number | null {
  const load = loadForReps(100, reps, formula);
  return load === null ? null : load;
}

/**
 * A training max is a deliberately conservative working number — classically
 * 90% of a tested 1RM (Wendler) — so percentage work stays repeatable.
 */
export function trainingMaxFrom(oneRepMaxKg: number, factor = 0.9): number {
  return oneRepMaxKg * factor;
}
