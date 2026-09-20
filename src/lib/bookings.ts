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
import { query, run } from "@/lib/db";

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

type BookingRow = {
  id: string;
  fixture_id: number;
  season: string;
  home_team: string;
  away_team: string;
  market: string;
  selection: string;
  stake: number;
  odds: number;
  expected_home_goals: number;
  expected_away_goals: number;
  model_prob: number;
  expected_value: number;
  notes: string | null;
  booked_at: Date | string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  outcome: string | null;
  pnl: number | null;
  settled_at: Date | string | null;
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
  source: "postgres-finished" | "postgres-provisional" | "persisted" | "fpl-live";
};

const FPL_FIXTURES_API = "https://fantasy.premierleague.com/api/fixtures/";
const FPL_FIXTURES_CACHE_TTL_MS = 30_000;

type FplFixtureResponse = {
  id: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  finished_provisional?: boolean;
  minutes?: number;
};

let fplFixturesCache: { fetchedAt: number; fixtures: FplFixtureResponse[] } | null = null;

function mapBookingRow(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    fixtureId: row.fixture_id,
    season: row.season,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    market: row.market as BookingMarket,
    selection: row.selection,
    stake: Number(row.stake),
    odds: Number(row.odds),
    expectedHomeGoals: Number(row.expected_home_goals),
    expectedAwayGoals: Number(row.expected_away_goals),
    modelProb: Number(row.model_prob),
    expectedValue: Number(row.expected_value),
    notes: row.notes,
    bookedAt: String(row.booked_at),
    status: row.status === "settled" ? "settled" : "open",
    homeScore: row.home_score === null || row.home_score === undefined ? null : Number(row.home_score),
    awayScore: row.away_score === null || row.away_score === undefined ? null : Number(row.away_score),
    outcome: row.outcome === "won" || row.outcome === "lost" ? row.outcome : null,
    pnl: row.pnl === null || row.pnl === undefined ? null : Number(row.pnl),
    settledAt: row.settled_at ? String(row.settled_at) : null,
  };
}

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

async function finishedScoresFromDatabase(includeProvisional = false) {
  const where = includeProvisional
    ? "team_h_score IS NOT NULL AND team_a_score IS NOT NULL"
    : "finished = true AND team_h_score IS NOT NULL AND team_a_score IS NOT NULL";
  return query<FinishedScore>(
    `SELECT fixture_id, season, team_h_score, team_a_score
     FROM fixtures
     WHERE ${where}`,
  );
}

async function persistedFixtureResults() {
  return query<FinishedScore>(
    `SELECT fixture_id, season, team_h_score, team_a_score FROM fixture_results`,
  );
}

function mergeSettlementScores(entries: SettlementScore[]) {
  const scoreByFixture = new Map<string, SettlementScore>();
  for (const entry of entries) {
    scoreByFixture.set(scoreKey(entry.season, entry.fixture_id), entry);
  }
  return scoreByFixture;
}

async function autoSettlementScores() {
  return mergeSettlementScores([
    ...(await finishedScoresFromDatabase(false)).map((score) => ({
      ...score,
      source: "postgres-finished" as const,
    })),
    ...(await persistedFixtureResults()).map((score) => ({
      ...score,
      source: "persisted" as const,
    })),
  ]);
}

async function persistResolvedFixtureResults(results: SettlementScore[]) {
  if (results.length === 0) return;

  const resolvedAt = new Date().toISOString();
  for (const result of results) {
    if (result.team_h_score === null || result.team_a_score === null) continue;
    await run(
      `INSERT INTO fixture_results (season, fixture_id, team_h_score, team_a_score, resolved_at, source)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (season, fixture_id) DO UPDATE SET
         team_h_score = EXCLUDED.team_h_score,
         team_a_score = EXCLUDED.team_a_score,
         resolved_at = EXCLUDED.resolved_at,
         source = EXCLUDED.source`,
      [
        result.season,
        result.fixture_id,
        result.team_h_score,
        result.team_a_score,
        resolvedAt,
        result.source,
      ],
    );
  }
}

function isSettleableFplFixture(fixture: FplFixtureResponse) {
  if (fixture.team_h_score === null || fixture.team_a_score === null) return false;
  return fixture.finished || fixture.finished_provisional === true || (fixture.minutes ?? 0) >= 90;
}

async function fetchFplFixtures() {
  const now = Date.now();
  if (fplFixturesCache && now - fplFixturesCache.fetchedAt < FPL_FIXTURES_CACHE_TTL_MS) {
    return fplFixturesCache.fixtures;
  }

  const response = await fetch(FPL_FIXTURES_API, {
    headers: { Accept: "application/json", "User-Agent": "fpl-formula-booking-resolver" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} while fetching live fixture results.`);
  }

  const fixtures = await response.json() as FplFixtureResponse[];
  fplFixturesCache = { fetchedAt: now, fixtures };
  return fixtures;
}

async function liveFixtureScores(fixtureIds: number[]) {
  if (fixtureIds.length === 0) return new Map<number, Pick<FinishedScore, "team_h_score" | "team_a_score">>();

  const fixtures = await fetchFplFixtures();
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

async function settleOpenBookingsWithScores(scoreByFixture: Map<string, Pick<FinishedScore, "team_h_score" | "team_a_score">>) {
  const open = await query<BookingRow>(`SELECT * FROM bookings WHERE status = 'open'`);
  if (open.length === 0) return 0;

  const settledAt = new Date().toISOString();
  let settled = 0;

  for (const row of open) {
    const score = scoreByFixture.get(scoreKey(row.season, row.fixture_id));
    if (!score || score.team_h_score === null || score.team_a_score === null) continue;
    if (!isBookingMarket(row.market)) continue;

    const homeScore = Number(score.team_h_score);
    const awayScore = Number(score.team_a_score);
    const outcome = gradeSelection(row.market, row.selection, homeScore, awayScore);
    if (!outcome) continue;

    await run(
      `UPDATE bookings
       SET status = 'settled', home_score = ?, away_score = ?, outcome = ?, pnl = ?, settled_at = ?
       WHERE id = ? AND status = 'open'`,
      [homeScore, awayScore, outcome, profitAndLoss(row.stake, row.odds, outcome), settledAt, row.id],
    );
    settled += 1;
  }

  return settled;
}

export async function settleOpenBookings() {
  return settleOpenBookingsWithScores(await autoSettlementScores());
}

export async function resolveOpenBookings(): Promise<ResolveOpenBookingsResult> {
  const scoreByFixture = await autoSettlementScores();
  const newlyResolvedScores: SettlementScore[] = [];

  for (const score of await finishedScoresFromDatabase(true)) {
    const key = scoreKey(score.season, score.fixture_id);
    if (scoreByFixture.has(key)) continue;
    const entry: SettlementScore = { ...score, source: "postgres-provisional" };
    scoreByFixture.set(key, entry);
    newlyResolvedScores.push(entry);
  }

  const openBeforeLive = await query<Pick<BookingRow, "season" | "fixture_id">>(
    `SELECT season, fixture_id FROM bookings WHERE status = 'open'`,
  );
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

  const remaining = (await query<{ count: number }>(
    `SELECT count(*)::INTEGER AS count FROM bookings WHERE status = 'open'`,
  ))[0]?.count ?? 0;

  return { settled, remaining, persistedFixtures: newlyResolvedScores.length };
}

export type ListBookingsOptions = {
  skipSettlement?: boolean;
};

export async function listBookings(season?: string, options?: ListBookingsOptions) {
  if (!options?.skipSettlement) {
    await settleOpenBookings();
  }
  const rows = season
    ? await query<BookingRow>(
        `SELECT * FROM bookings WHERE season = ? ORDER BY booked_at DESC`,
        [season],
      )
    : await query<BookingRow>(`SELECT * FROM bookings ORDER BY booked_at DESC`);
  return rows.map(mapBookingRow);
}

const BOOKING_INSERT_COLUMNS = `
  id, fixture_id, season, home_team, away_team, market, selection, stake, odds,
  expected_home_goals, expected_away_goals, model_prob, expected_value, notes, booked_at,
  status, home_score, away_score, outcome, pnl, settled_at
`;

function bookingInsertValues(booking: BookingRecord) {
  return [
    booking.id,
    booking.fixtureId,
    booking.season,
    booking.homeTeam,
    booking.awayTeam,
    booking.market,
    booking.selection,
    booking.stake,
    booking.odds,
    booking.expectedHomeGoals,
    booking.expectedAwayGoals,
    booking.modelProb,
    booking.expectedValue,
    booking.notes,
    booking.bookedAt,
    "open",
    null,
    null,
    null,
    null,
    null,
  ];
}

async function insertBookings(bookings: BookingRecord[]) {
  if (bookings.length === 0) return;

  const placeholders = bookings.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = bookings.flatMap((booking) => bookingInsertValues(booking));
  await run(
    `INSERT INTO bookings (${BOOKING_INSERT_COLUMNS}) VALUES ${placeholders}`,
    values,
  );
}

export async function bookSelection(input: BookingInput) {
  const booking = buildBookingRecord(input);
  await insertBookings([booking]);
  return booking;
}

export async function bookSelections(inputs: BookingInput[]) {
  if (inputs.length === 0) return [];

  const open = await query<Pick<BookingRow, "fixture_id" | "market" | "selection">>(
    `SELECT fixture_id, market, selection FROM bookings WHERE status = 'open'`,
  );
  const taken = new Set(open.map((row) => `${row.fixture_id}:${row.market}:${row.selection}`));
  const records = inputs
    .filter((input) => !taken.has(`${input.fixtureId}:${input.market}:${input.selection}`))
    .map((input) => buildBookingRecord(input));
  if (records.length === 0) return [];

  await insertBookings(records);
  return records;
}

export async function cancelBooking(id: string) {
  const rows = await query<BookingRow>(`SELECT * FROM bookings WHERE id = ?`, [id]);
  const booking = rows[0];
  if (!booking) throw new BookingRequestError("Booking not found.", 404);
  if (booking.status !== "open") {
    throw new BookingRequestError("Settled bookings stay on the ledger.", 409);
  }

  await run(`DELETE FROM bookings WHERE id = ? AND status = 'open'`, [id]);
}
