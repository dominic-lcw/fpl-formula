import { randomUUID } from "node:crypto";
import { expectedValue, modelProbabilityForMarket, type FixtureForecast } from "@/lib/match-forecast-model";
import { getConnection, persistUserTable, query, resetReadConnection } from "@/lib/db";

export type BetMarket = "1X2" | "over_under" | "btts" | "correct_score";

export type BetRecord = {
  id: string;
  fixtureId: number;
  season: string;
  homeTeam: string;
  awayTeam: string;
  market: BetMarket;
  selection: string;
  stake: number;
  odds: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  modelProb: number;
  expectedValue: number;
  notes: string | null;
  createdAt: string;
  settled: boolean;
  result: string | null;
};

export type BetInput = {
  fixtureId: number;
  season: string;
  homeTeam: string;
  awayTeam: string;
  market: BetMarket;
  selection: string;
  stake: number;
  odds: number;
  forecast: Pick<
    FixtureForecast,
    "expectedHomeGoals" | "expectedAwayGoals" | "homeWinProb" | "drawProb" | "awayWinProb" | "over25Prob" | "bttsProb" | "topScorelines"
  >;
  notes?: string;
};

type BetRow = {
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
  created_at: Date | string;
  settled: boolean;
  result: string | null;
};

function mapBetRow(row: BetRow): BetRecord {
  return {
    id: row.id,
    fixtureId: row.fixture_id,
    season: row.season,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    market: row.market as BetMarket,
    selection: row.selection,
    stake: row.stake,
    odds: row.odds,
    expectedHomeGoals: row.expected_home_goals,
    expectedAwayGoals: row.expected_away_goals,
    modelProb: row.model_prob,
    expectedValue: row.expected_value,
    notes: row.notes,
    createdAt: String(row.created_at),
    settled: row.settled,
    result: row.result,
  };
}

export function buildBetRecord(input: BetInput): BetRecord {
  const modelProb = modelProbabilityForMarket(input.forecast, input.market, input.selection);
  const ev = expectedValue(modelProb, input.odds);
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
    expectedValue: ev,
    notes: input.notes ?? null,
    createdAt: new Date().toISOString(),
    settled: false,
    result: null,
  };
}

export async function listBets(season?: string) {
  const rows = season
    ? await query<BetRow>(
        `SELECT * FROM bets WHERE season = ? ORDER BY created_at DESC`,
        [season],
      )
    : await query<BetRow>(`SELECT * FROM bets ORDER BY created_at DESC`);
  return rows.map(mapBetRow);
}

export async function addBet(input: BetInput) {
  const bet = buildBetRecord(input);
  const connection = await getConnection();
  await connection.run(
    `INSERT INTO bets (
      id, fixture_id, season, home_team, away_team, market, selection, stake, odds,
      expected_home_goals, expected_away_goals, model_prob, expected_value, notes, created_at, settled, result
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, null)`,
    [
      bet.id,
      bet.fixtureId,
      bet.season,
      bet.homeTeam,
      bet.awayTeam,
      bet.market,
      bet.selection,
      bet.stake,
      bet.odds,
      bet.expectedHomeGoals,
      bet.expectedAwayGoals,
      bet.modelProb,
      bet.expectedValue,
      bet.notes,
      bet.createdAt,
    ],
  );
  await persistUserTable(connection, "bets");
  resetReadConnection();
  return bet;
}

export async function deleteBet(id: string) {
  const connection = await getConnection();
  await connection.run(`DELETE FROM bets WHERE id = ?`, [id]);
  await persistUserTable(connection, "bets");
  resetReadConnection();
}
