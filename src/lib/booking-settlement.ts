export type BookingMarket = "1X2" | "over_under" | "btts" | "correct_score";
export type BookingStatus = "open" | "settled";
export type BookingOutcome = "won" | "lost";

export type BookingRecord = {
  id: string;
  fixtureId: number;
  season: string;
  homeTeam: string;
  awayTeam: string;
  market: BookingMarket;
  selection: string;
  stake: number;
  odds: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  modelProb: number;
  expectedValue: number;
  notes: string | null;
  bookedAt: string;
  status: BookingStatus;
  homeScore: number | null;
  awayScore: number | null;
  outcome: BookingOutcome | null;
  pnl: number | null;
  settledAt: string | null;
};

const markets = new Set<BookingMarket>(["1X2", "over_under", "btts", "correct_score"]);

export function isBookingMarket(value: string): value is BookingMarket {
  return markets.has(value as BookingMarket);
}

export function isBookableSelection(market: BookingMarket, selection: string) {
  switch (market) {
    case "1X2":
      return selection === "home" || selection === "draw" || selection === "away";
    case "over_under":
      return selection === "over_2.5" || selection === "under_2.5";
    case "btts":
      return selection === "yes" || selection === "no";
    case "correct_score":
      return /^\d+-\d+$/.test(selection);
    default:
      return false;
  }
}

export function gradeSelection(
  market: BookingMarket,
  selection: string,
  homeScore: number,
  awayScore: number,
): BookingOutcome | null {
  if (!isBookableSelection(market, selection)) return null;

  switch (market) {
    case "1X2": {
      const result = homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";
      return selection === result ? "won" : "lost";
    }
    case "over_under": {
      const over = homeScore + awayScore > 2.5;
      return selection === "over_2.5" ? (over ? "won" : "lost") : (over ? "lost" : "won");
    }
    case "btts": {
      const bothScored = homeScore > 0 && awayScore > 0;
      return selection === "yes" ? (bothScored ? "won" : "lost") : (bothScored ? "lost" : "won");
    }
    case "correct_score": {
      const [home, away] = selection.split("-").map(Number);
      return home === homeScore && away === awayScore ? "won" : "lost";
    }
    default:
      return null;
  }
}

/** Net profit. A winner returns stake × (odds − 1); a loser loses the stake. */
export function profitAndLoss(stake: number, odds: number, outcome: BookingOutcome) {
  return outcome === "won" ? stake * (odds - 1) : -stake;
}
