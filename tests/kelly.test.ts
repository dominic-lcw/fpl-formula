import { describe, expect, it } from "vitest";
import { buildKellyPlan, kellyFraction } from "../src/lib/kelly";

describe("Kelly stakes", () => {
  it("sizes a single edge as a fraction of capital and skips a price with no edge", () => {
    expect(kellyFraction(0.55, 2.1)).toBeCloseTo(0.140909, 5);
    expect(kellyFraction(0.4, 2.1)).toBe(0);

    const plan = buildKellyPlan(
      [
        { fixtureId: 10, probability: 0.55, odds: 2.1 },
        { fixtureId: 11, probability: 0.4, odds: 2.1 },
      ],
      1000,
    );

    expect(plan.bets).toEqual([
      { fixtureId: 10, probability: 0.55, odds: 2.1, kellyFraction: kellyFraction(0.55, 2.1), stake: 140.91 },
    ]);
    expect(plan.passed).toBe(1);
    expect(plan.totalStake).toBe(140.91);
    expect(plan.scaled).toBe(false);
  });

  it("scales simultaneous bets so the list stays inside the capital", () => {
    const plan = buildKellyPlan(
      [
        { fixtureId: 1, probability: 0.9, odds: 2 },
        { fixtureId: 2, probability: 0.9, odds: 2 },
      ],
      100,
    );

    expect(plan.scaled).toBe(true);
    expect(plan.rawFractionTotal).toBeCloseTo(1.6, 5);
    expect(plan.bets.map((bet) => bet.stake)).toEqual([50, 50]);
    expect(plan.totalStake).toBe(100);
    expect(plan.passed).toBe(0);
  });

  it("returns an empty list when the capital is not positive", () => {
    const plan = buildKellyPlan([{ fixtureId: 1, probability: 0.7, odds: 2 }], 0);
    expect(plan.bets).toEqual([]);
    expect(plan.totalStake).toBe(0);
  });
});
