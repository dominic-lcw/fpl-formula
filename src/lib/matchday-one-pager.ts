import type { BookingMarket, BookingOutcome, BookingRecord, BookingStatus } from "@/lib/booking-settlement";
import { highestMatchOutcome } from "@/lib/booking-settlement";
import type { FixtureForecast } from "@/lib/match-forecast-model";

export type OnePagerForecast = {
  source: "model" | "booked";
  predictedWinner: string | null;
  winnerProbability: number | null;
  mostLikelyScore: string | null;
  mostLikelyScoreProbability: number | null;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeWinProb: number | null;
  drawProb: number | null;
  awayWinProb: number | null;
  over25Prob: number | null;
  bttsProb: number | null;
  topScorelines: Array<{ score: string; probability: number }>;
};

export type OnePagerBet = {
  market: BookingMarket;
  selection: string;
  probability: number;
  label: string;
  placed: boolean;
};

export type OnePagerBookedOdds = {
  odds: number;
  stake: number;
  expectedValue: number;
  status: BookingStatus;
  outcome: BookingOutcome | null;
  pnl: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type OnePagerMatch = {
  fixtureId: number;
  kickoffTime: string | null;
  homeTeam: string;
  awayTeam: string;
  homeShortName: string;
  awayShortName: string;
  forecast: OnePagerForecast | null;
  bet: OnePagerBet | null;
  bookedOdds: OnePagerBookedOdds | null;
};

type ForecastSlice = Pick<
  FixtureForecast,
  | "fixtureId"
  | "event"
  | "kickoffTime"
  | "homeTeam"
  | "awayTeam"
  | "homeShortName"
  | "awayShortName"
  | "expectedHomeGoals"
  | "expectedAwayGoals"
  | "homeWinProb"
  | "drawProb"
  | "awayWinProb"
  | "over25Prob"
  | "bttsProb"
  | "topScorelines"
>;

export type MatchdaySlateLike = {
  fixtureId: number;
  gameweek: number;
  kickoffTime: string | null;
  homeTeam: string;
  awayTeam: string;
  homeShortName: string;
  awayShortName: string;
  booking: BookingRecord | null;
};

type MatchdaySource = {
  fixtureId: number;
  kickoffTime: string | null;
  homeTeam: string;
  awayTeam: string;
  homeShortName: string;
  awayShortName: string;
  forecast: ForecastSlice | null;
  booking: BookingRecord | null;
};

export function describeSelection(
  market: BookingMarket,
  selection: string,
  homeShortName: string,
  awayShortName: string,
) {
  switch (market) {
    case "1X2":
      if (selection === "home") return `${homeShortName} win`;
      if (selection === "away") return `${awayShortName} win`;
      if (selection === "draw") return "Draw";
      return selection;
    case "over_under":
      return selection === "over_2.5" ? "Over 2.5" : "Under 2.5";
    case "btts":
      return selection === "yes" ? "BTTS yes" : "BTTS no";
    case "correct_score":
      return selection;
    default:
      return selection;
  }
}

function predictedWinner(fixture: ForecastSlice) {
  const outcomes = [
    { label: `${fixture.homeShortName} win`, probability: fixture.homeWinProb },
    { label: "Draw", probability: fixture.drawProb },
    { label: `${fixture.awayShortName} win`, probability: fixture.awayWinProb },
  ];
  return outcomes.reduce((best, outcome) => (outcome.probability > best.probability ? outcome : best));
}

function forecastFromModel(fixture: ForecastSlice): OnePagerForecast {
  const winner = predictedWinner(fixture);
  const scoreline = fixture.topScorelines[0] ?? null;
  return {
    source: "model",
    predictedWinner: winner.label,
    winnerProbability: winner.probability,
    mostLikelyScore: scoreline ? `${scoreline.home}-${scoreline.away}` : null,
    mostLikelyScoreProbability: scoreline?.prob ?? null,
    expectedHomeGoals: fixture.expectedHomeGoals,
    expectedAwayGoals: fixture.expectedAwayGoals,
    homeWinProb: fixture.homeWinProb,
    drawProb: fixture.drawProb,
    awayWinProb: fixture.awayWinProb,
    over25Prob: fixture.over25Prob,
    bttsProb: fixture.bttsProb,
    topScorelines: fixture.topScorelines.slice(0, 3).map((line) => ({
      score: `${line.home}-${line.away}`,
      probability: line.prob,
    })),
  };
}

function forecastFromBooking(booking: BookingRecord, homeShortName: string, awayShortName: string): OnePagerForecast {
  return {
    source: "booked",
    predictedWinner: describeSelection(booking.market, booking.selection, homeShortName, awayShortName),
    winnerProbability: booking.modelProb,
    mostLikelyScore: null,
    mostLikelyScoreProbability: null,
    expectedHomeGoals: booking.expectedHomeGoals,
    expectedAwayGoals: booking.expectedAwayGoals,
    homeWinProb: null,
    drawProb: null,
    awayWinProb: null,
    over25Prob: null,
    bttsProb: null,
    topScorelines: [],
  };
}

function preferredBooking(bookings: BookingRecord[], fixtureId: number): BookingRecord | null {
  const matches = bookings.filter((booking) => booking.fixtureId === fixtureId);
  return matches.find((booking) => booking.pnl !== null)
    ?? matches.find((booking) => booking.status === "open")
    ?? matches[0]
    ?? null;
}

function sourceFromForecast(forecast: ForecastSlice, booking: BookingRecord | null): MatchdaySource {
  return {
    fixtureId: forecast.fixtureId,
    kickoffTime: forecast.kickoffTime,
    homeTeam: forecast.homeTeam,
    awayTeam: forecast.awayTeam,
    homeShortName: forecast.homeShortName,
    awayShortName: forecast.awayShortName,
    forecast,
    booking,
  };
}

export function collectMatchdaySources(
  gameweek: number,
  forecasts: ForecastSlice[],
  bookings: BookingRecord[],
  slateRows: MatchdaySlateLike[],
): MatchdaySource[] {
  const forecastById = new Map(
    forecasts.filter((fixture) => fixture.event === gameweek).map((fixture) => [fixture.fixtureId, fixture]),
  );
  const slate = slateRows.filter((row) => row.gameweek === gameweek);

  if (slate.length === 0) {
    return [...forecastById.values()].map((forecast) => sourceFromForecast(forecast, preferredBooking(bookings, forecast.fixtureId)));
  }

  const seen = new Set<number>();
  const sources = slate.map((row) => {
    seen.add(row.fixtureId);
    return {
      fixtureId: row.fixtureId,
      kickoffTime: row.kickoffTime,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeShortName: row.homeShortName,
      awayShortName: row.awayShortName,
      forecast: forecastById.get(row.fixtureId) ?? null,
      booking: row.booking ?? preferredBooking(bookings, row.fixtureId),
    };
  });

  for (const forecast of forecastById.values()) {
    if (seen.has(forecast.fixtureId)) continue;
    sources.push(sourceFromForecast(forecast, preferredBooking(bookings, forecast.fixtureId)));
  }

  return sources;
}

function toMatch(source: MatchdaySource): OnePagerMatch {
  const booking = source.booking;
  const liveForecast = source.forecast ? forecastFromModel(source.forecast) : null;
  const forecast = liveForecast ?? (
    booking ? forecastFromBooking(booking, source.homeShortName, source.awayShortName) : null
  );

  const modelPick = source.forecast ? highestMatchOutcome(source.forecast) : null;
  const bet: OnePagerBet | null = booking
    ? {
        market: booking.market,
        selection: booking.selection,
        probability: booking.modelProb,
        label: describeSelection(booking.market, booking.selection, source.homeShortName, source.awayShortName),
        placed: true,
      }
    : modelPick
      ? {
          market: modelPick.market,
          selection: modelPick.selection,
          probability: modelPick.probability,
          label: describeSelection(modelPick.market, modelPick.selection, source.homeShortName, source.awayShortName),
          placed: false,
        }
      : null;

  return {
    fixtureId: source.fixtureId,
    kickoffTime: source.kickoffTime,
    homeTeam: source.homeTeam,
    awayTeam: source.awayTeam,
    homeShortName: source.homeShortName,
    awayShortName: source.awayShortName,
    forecast,
    bet,
    bookedOdds: booking
      ? {
          odds: booking.odds,
          stake: booking.stake,
          expectedValue: booking.expectedValue,
          status: booking.status,
          outcome: booking.outcome,
          pnl: booking.pnl,
          homeScore: booking.homeScore,
          awayScore: booking.awayScore,
        }
      : null,
  };
}

export type MatchdayOnePager = {
  season: string;
  gameweek: number;
  matches: OnePagerMatch[];
  bookedCount: number;
  stake: number;
  settledPnl: number;
  settledCount: number;
};

export function buildMatchdayOnePager(input: {
  season: string;
  gameweek: number;
  forecasts: ForecastSlice[];
  bookings: BookingRecord[];
  slateRows: MatchdaySlateLike[];
}): MatchdayOnePager {
  const matches = collectMatchdaySources(input.gameweek, input.forecasts, input.bookings, input.slateRows).map(toMatch);
  const booked = matches.filter((match) => match.bookedOdds);
  const settled = booked.filter((match) => match.bookedOdds?.pnl !== null && match.bookedOdds?.pnl !== undefined);

  return {
    season: input.season,
    gameweek: input.gameweek,
    matches,
    bookedCount: booked.length,
    stake: booked.reduce((total, match) => total + (match.bookedOdds?.stake ?? 0), 0),
    settledPnl: settled.reduce((total, match) => total + (match.bookedOdds?.pnl ?? 0), 0),
    settledCount: settled.length,
  };
}
