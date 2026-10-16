export type BookingStrategy = "largest" | "kelly";

export type KellyCandidate = {
  fixtureId: number;
  probability: number;
  odds: number;
};

export type KellyBet = KellyCandidate & {
  /** Full Kelly fraction of capital before any simultaneous scaling. */
  kellyFraction: number;
  stake: number;
};

export type KellyPlan = {
  bets: KellyBet[];
  /** Open prices with usable odds that Kelly does not bet. */
  passed: number;
  capital: number;
  totalStake: number;
  /** Sum of the unscaled Kelly fractions. Above 1 means the list was scaled. */
  rawFractionTotal: number;
  scaled: boolean;
};

/**
 * Full Kelly fraction for decimal odds: (p × odds − 1) / (odds − 1).
 * Zero when the model probability is not above the price.
 */
export function kellyFraction(probability: number, odds: number) {
  if (!Number.isFinite(probability) || !Number.isFinite(odds) || odds <= 1) return 0;
  const chance = Math.min(Math.max(probability, 0), 1);
  if (chance <= 0) return 0;
  const fraction = (chance * odds - 1) / (odds - 1);
  if (!Number.isFinite(fraction) || fraction <= 0) return 0;
  return Math.min(fraction, 1);
}

function roundCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Stakes for several matches that settle together.
 * Each positive Kelly fraction is a share of `capital`. When those shares
 * add up to more than the capital, every stake is scaled by the same factor
 * so the list still fits in the bank.
 */
export function buildKellyPlan(candidates: KellyCandidate[], capital: number): KellyPlan {
  const usable = candidates.filter((candidate) => (
    Number.isFinite(candidate.probability)
    && Number.isFinite(candidate.odds)
    && candidate.odds > 1
  ));
  const positive = usable
    .map((candidate) => ({ ...candidate, kellyFraction: kellyFraction(candidate.probability, candidate.odds) }))
    .filter((candidate) => candidate.kellyFraction > 0);
  const rawFractionTotal = positive.reduce((sum, bet) => sum + bet.kellyFraction, 0);
  const bank = Number.isFinite(capital) && capital > 0 ? capital : 0;

  if (bank <= 0 || positive.length === 0) {
    return {
      bets: [],
      passed: usable.length,
      capital: bank,
      totalStake: 0,
      rawFractionTotal,
      scaled: false,
    };
  }

  const scale = rawFractionTotal > 1 ? 1 / rawFractionTotal : 1;
  let bets: KellyBet[] = positive
    .map((bet) => ({
      ...bet,
      stake: roundCents(bet.kellyFraction * scale * bank),
    }))
    .filter((bet) => bet.stake >= 0.01);

  let totalStake = roundCents(bets.reduce((sum, bet) => sum + bet.stake, 0));
  while (totalStake > bank + 0.001 && bets.length > 0) {
    const index = bets.reduce((largest, bet, betIndex) => (bet.stake > bets[largest]!.stake ? betIndex : largest), 0);
    const nextStake = roundCents(bets[index]!.stake - 0.01);
    if (nextStake < 0.01) {
      bets.splice(index, 1);
    } else {
      bets[index] = { ...bets[index]!, stake: nextStake };
    }
    totalStake = roundCents(bets.reduce((sum, bet) => sum + bet.stake, 0));
  }

  return {
    bets,
    passed: usable.length - bets.length,
    capital: bank,
    totalStake,
    rawFractionTotal,
    scaled: rawFractionTotal > 1,
  };
}
