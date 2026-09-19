import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
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
import { getConnection, parquetDirectory, persistUserTable, query } from "@/lib/db";

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

async function finishedScores() {
  const filePath = path.join(parquetDirectory, "fixtures.parquet");
  try {
    await stat(filePath);
  } catch {
    return [] as FinishedScore[];
  }

  const escaped = filePath.replaceAll("'", "''");
  return query<FinishedScore>(
    `SELECT fixture_id, season, team_h_score, team_a_score
     FROM read_parquet('${escaped}')
     WHERE finished = true AND team_h_score IS NOT NULL AND team_a_score IS NOT NULL`,
  );
}

export async function settleOpenBookings() {
  const open = await query<BookingRow>(`SELECT * FROM bookings WHERE status = 'open'`);
  if (open.length === 0) return 0;

  const scores = await finishedScores();
  const scoreByFixture = new Map(scores.map((score) => [`${score.season}:${score.fixture_id}`, score]));
  const connection = await getConnection();
  const settledAt = new Date().toISOString();
  let settled = 0;

  for (const row of open) {
    const score = scoreByFixture.get(`${row.season}:${row.fixture_id}`);
    if (!score || score.team_h_score === null || score.team_a_score === null) continue;
    if (!isBookingMarket(row.market)) continue;

    const homeScore = Number(score.team_h_score);
    const awayScore = Number(score.team_a_score);
    const outcome = gradeSelection(row.market, row.selection, homeScore, awayScore);
    if (!outcome) continue;

    await connection.run(
      `UPDATE bookings
       SET status = 'settled', home_score = ?, away_score = ?, outcome = ?, pnl = ?, settled_at = ?
       WHERE id = ? AND status = 'open'`,
      [homeScore, awayScore, outcome, profitAndLoss(row.stake, row.odds, outcome), settledAt, row.id],
    );
    settled += 1;
  }

  if (settled > 0) {
    await persistUserTable(connection, "bookings");
  }
  return settled;
}

export async function listBookings(season?: string) {
  await settleOpenBookings();
  const rows = season
    ? await query<BookingRow>(
        `SELECT * FROM bookings WHERE season = ? ORDER BY booked_at DESC`,
        [season],
      )
    : await query<BookingRow>(`SELECT * FROM bookings ORDER BY booked_at DESC`);
  return rows.map(mapBookingRow);
}

async function insertBooking(connection: Awaited<ReturnType<typeof getConnection>>, booking: BookingRecord) {
  await connection.run(
    `INSERT INTO bookings (
      id, fixture_id, season, home_team, away_team, market, selection, stake, odds,
      expected_home_goals, expected_away_goals, model_prob, expected_value, notes, booked_at,
      status, home_score, away_score, outcome, pnl, settled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, NULL, NULL, NULL)`,
    [
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
    ],
  );
}

export async function bookSelection(input: BookingInput) {
  const booking = buildBookingRecord(input);
  const connection = await getConnection();
  await insertBooking(connection, booking);
  await persistUserTable(connection, "bookings");
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

  const connection = await getConnection();
  for (const booking of records) {
    await insertBooking(connection, booking);
  }
  await persistUserTable(connection, "bookings");
  return records;
}

export async function cancelBooking(id: string) {
  const rows = await query<BookingRow>(`SELECT * FROM bookings WHERE id = ?`, [id]);
  const booking = rows[0];
  if (!booking) throw new BookingRequestError("Booking not found.", 404);
  if (booking.status !== "open") {
    throw new BookingRequestError("Settled bookings stay on the ledger.", 409);
  }

  const connection = await getConnection();
  await connection.run(`DELETE FROM bookings WHERE id = ? AND status = 'open'`, [id]);
  await persistUserTable(connection, "bookings");
}
