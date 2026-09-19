import { randomUUID } from "node:crypto";
import {
  gradeSelection,
  isBookableSelection,
  isBookingMarket,
  profitAndLoss,
  type BookingMarket,
  type BookingOutcome,
  type BookingRecord,
  type BookingStatus,
} from "@/lib/booking-settlement";
import { expectedValue, modelProbabilityForMarket, type FixtureForecast } from "@/lib/match-forecast-model";
import { query } from "@/lib/db";
import {
  readBookings,
  readFixtureResults,
  writeBookings,
  writeFixtureResults,
  type FixtureResultRecord,
} from "@/lib/user-store";

export type { BookingMarket, BookingOutcome, BookingRecord, BookingStatus };
export { gradeSelection, isBookableSelection, profitAndLoss };

export class BookingRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BookingRequestError";
  }
}

export type BookingInput = {
  fixtureId: number;
  season: string;
  homeTeam: string;
  awayTeam: string;
  market: BookingMarket;
  selection: string;
  stake: number;
  odds: number;
  forecast: Pick<
    FixtureForecast,
    "expectedHomeGoals" | "expectedAwayGoals" | "homeWinProb" | "drawProb" | "awayWinProb" | "over25Prob" | "bttsProb" | "topScorelines"
  >;
  notes?: string;
};

type FinishedScore = {
  fixture_id: number;
  season: string;
  team_h_score: number | null;
  team_a_score: number | null;
};

type ResolveOpenBookingsResult = {
  settled: number;
  remaining: number;
  persistedFixtures: number;
};

type SettlementScore = FinishedScore & {
  source: "fixtures-finished" | "fixtures-provisional" | "persisted" | "fpl-live";
};

const FPL_FIXTURES_API = "https://fantasy.premierleague.com/api/fixtures/";

type FplFixtureResponse = {
  id: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  finished_provisional?: boolean;
  minutes?: number;
};

export function buildBookingRecord(input: BookingInput): BookingRecord {
  if (!isBookingMarket(input.market) || !isBookableSelection(input.market, input.selection)) {
    throw new BookingRequestError("That market or selection cannot be booked.", 400);
  }
  if (!Number.isFinite(input.stake) || input.stake <= 0 || !Number.isFinite(input.odds) || input.odds <= 1) {
    throw new BookingRequestError("Stake must be positive and decimal odds must be greater than 1.", 400);
  }

  const modelProb = modelProbabilityForMarket(input.forecast, input.market, input.selection);
  return {
    id: randomUUID(),
    fixtureId: input.fixtureId,
    season: input.season,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    market: input.market,
    selection: input.selection,
    stake: input.stake,
    odds: input.odds,
    expectedHomeGoals: input.forecast.expectedHomeGoals,
    expectedAwayGoals: input.forecast.expectedAwayGoals,
    modelProb,
    expectedValue: expectedValue(modelProb, input.odds),
    notes: input.notes ?? null,
    bookedAt: new Date().toISOString(),
    status: "open",
    homeScore: null,
    awayScore: null,
    outcome: null,
    pnl: null,
    settledAt: null,
  };
}

async function finishedScoresFromFixtures(includeProvisional = false) {
  const where = includeProvisional
    ? "team_h_score IS NOT NULL AND team_a_score IS NOT NULL"
    : "finished = true AND team_h_score IS NOT NULL AND team_a_score IS NOT NULL";
  return query<FinishedScore>(
    `SELECT fixture_id, season, team_h_score, team_a_score FROM fixtures WHERE ${where}`,
  );
}

function persistedFixtureResults(results: FixtureResultRecord[]): FinishedScore[] {
  return results.map((result) => ({
    fixture_id: result.fixtureId,
    season: result.season,
    team_h_score: result.teamHScore,
    team_a_score: result.teamAScore,
  }));
}

function mergeSettlementScores(entries: SettlementScore[]) {
  const scoreByFixture = new Map<string, SettlementScore>();
  for (const entry of entries) {
    scoreByFixture.set(scoreKey(entry.season, entry.fixture_id), entry);
  }
  return scoreByFixture;
}

async function autoSettlementScores() {
  const persisted = await readFixtureResults();
  return mergeSettlementScores([
    ...(await finishedScoresFromFixtures(false)).map((score) => ({
      ...score,
      source: "fixtures-finished" as const,
    })),
    ...persistedFixtureResults(persisted).map((score) => ({
      ...score,
      source: "persisted" as const,
    })),
  ]);
}

async function persistResolvedFixtureResults(results: SettlementScore[]) {
  if (results.length === 0) return;

  const existing = await readFixtureResults();
  const byKey = new Map(existing.map((result) => [scoreKey(result.season, result.fixtureId), result]));
  const resolvedAt = new Date().toISOString();

  for (const result of results) {
    if (result.team_h_score === null || result.team_a_score === null) continue;
    byKey.set(scoreKey(result.season, result.fixture_id), {
      season: result.season,
      fixtureId: result.fixture_id,
      teamHScore: Number(result.team_h_score),
      teamAScore: Number(result.team_a_score),
      resolvedAt,
      source: result.source,
    });
  }

  await writeFixtureResults([...byKey.values()]);
}

function isSettleableFplFixture(fixture: FplFixtureResponse) {
  if (fixture.team_h_score === null || fixture.team_a_score === null) return false;
  return fixture.finished || fixture.finished_provisional === true || (fixture.minutes ?? 0) >= 90;
}

async function liveFixtureScores(fixtureIds: number[]) {
  if (fixtureIds.length === 0) return new Map<number, Pick<FinishedScore, "team_h_score" | "team_a_score">>();

  const response = await fetch(FPL_FIXTURES_API, {
    headers: { Accept: "application/json", "User-Agent": "fpl-formula-booking-resolver" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} while fetching live fixture results.`);
  }

  const fixtures = await response.json() as FplFixtureResponse[];
  const wanted = new Set(fixtureIds);
  const scores = new Map<number, Pick<FinishedScore, "team_h_score" | "team_a_score">>();
  for (const fixture of fixtures) {
    if (!wanted.has(fixture.id) || !isSettleableFplFixture(fixture)) continue;
    scores.set(fixture.id, {
      team_h_score: fixture.team_h_score,
      team_a_score: fixture.team_a_score,
    });
  }
  return scores;
}

function scoreKey(season: string, fixtureId: number) {
  return `${season}:${fixtureId}`;
}

async function settleOpenBookingsWithScores(
  scoreByFixture: Map<string, Pick<FinishedScore, "team_h_score" | "team_a_score">>,
) {
  const bookings = await readBookings();
  const open = bookings.filter((booking) => booking.status === "open");
  if (open.length === 0) return 0;

  const settledAt = new Date().toISOString();
  let settled = 0;
  let changed = false;

  const nextBookings = bookings.map((booking) => {
    if (booking.status !== "open") return booking;

    const score = scoreByFixture.get(scoreKey(booking.season, booking.fixtureId));
    if (!score || score.team_h_score === null || score.team_a_score === null) return booking;
    if (!isBookingMarket(booking.market)) return booking;

    const homeScore = Number(score.team_h_score);
    const awayScore = Number(score.team_a_score);
    const outcome = gradeSelection(booking.market, booking.selection, homeScore, awayScore);
    if (!outcome) return booking;

    settled += 1;
    changed = true;
    return {
      ...booking,
      status: "settled" as const,
      homeScore,
      awayScore,
      outcome,
      pnl: profitAndLoss(booking.stake, booking.odds, outcome),
      settledAt,
    };
  });

  if (changed) {
    await writeBookings(nextBookings);
  }
  return settled;
}

export async function settleOpenBookings() {
  return settleOpenBookingsWithScores(await autoSettlementScores());
}

export async function resolveOpenBookings(): Promise<ResolveOpenBookingsResult> {
  const scoreByFixture = await autoSettlementScores();
  const newlyResolvedScores: SettlementScore[] = [];

  for (const score of await finishedScoresFromFixtures(true)) {
    const key = scoreKey(score.season, score.fixture_id);
    if (scoreByFixture.has(key)) continue;
    const entry: SettlementScore = { ...score, source: "fixtures-provisional" };
    scoreByFixture.set(key, entry);
    newlyResolvedScores.push(entry);
  }

  const openBeforeLive = (await readBookings())
    .filter((booking) => booking.status === "open")
    .map((booking) => ({ season: booking.season, fixture_id: booking.fixtureId }));
  const unresolvedFixtureIds = openBeforeLive
    .filter((row) => !scoreByFixture.has(scoreKey(row.season, row.fixture_id)))
    .map((row) => row.fixture_id);

  const liveScores = await liveFixtureScores([...new Set(unresolvedFixtureIds)]);
  for (const row of openBeforeLive) {
    const liveScore = liveScores.get(row.fixture_id);
    if (!liveScore || liveScore.team_h_score === null || liveScore.team_a_score === null) continue;
    const key = scoreKey(row.season, row.fixture_id);
    if (scoreByFixture.has(key)) continue;
    const entry: SettlementScore = {
      season: row.season,
      fixture_id: row.fixture_id,
      team_h_score: liveScore.team_h_score,
      team_a_score: liveScore.team_a_score,
      source: "fpl-live",
    };
    scoreByFixture.set(key, entry);
    newlyResolvedScores.push(entry);
  }

  const settled = await settleOpenBookingsWithScores(scoreByFixture);

  if (newlyResolvedScores.length > 0) {
    await persistResolvedFixtureResults(newlyResolvedScores);
  }

  const remaining = (await readBookings()).filter((booking) => booking.status === "open").length;

  return { settled, remaining, persistedFixtures: newlyResolvedScores.length };
}

export async function listBookings(
  season?: string,
  options: { settle?: boolean } = {},
) {
  if (options.settle) {
    await settleOpenBookings();
  }

  const bookings = await readBookings();
  const filtered = season
    ? bookings.filter((booking) => booking.season === season)
    : bookings;

  return filtered.sort((left, right) => right.bookedAt.localeCompare(left.bookedAt));
}

export async function bookSelection(input: BookingInput) {
  const booking = buildBookingRecord(input);
  const bookings = await readBookings();
  bookings.push(booking);
  await writeBookings(bookings);
  return booking;
}

export async function bookSelections(inputs: BookingInput[]) {
  if (inputs.length === 0) return [];

  const bookings = await readBookings();
  const taken = new Set(
    bookings
      .filter((booking) => booking.status === "open")
      .map((booking) => `${booking.fixtureId}:${booking.market}:${booking.selection}`),
  );
  const records = inputs
    .filter((input) => !taken.has(`${input.fixtureId}:${input.market}:${input.selection}`))
    .map((input) => buildBookingRecord(input));
  if (records.length === 0) return [];

  await writeBookings([...bookings, ...records]);
  return records;
}

export async function cancelBooking(id: string) {
  const bookings = await readBookings();
  const booking = bookings.find((entry) => entry.id === id);
  if (!booking) throw new BookingRequestError("Booking not found.", 404);
  if (booking.status !== "open") {
    throw new BookingRequestError("Settled bookings stay on the ledger.", 409);
  }

  await writeBookings(bookings.filter((entry) => entry.id !== id));
}
