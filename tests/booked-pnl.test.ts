import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-pnl-${randomUUID()}`);
const testUserDirectory = path.join(tmpdir(), `fpl-formula-pnl-user-${randomUUID()}`);
process.env.FPL_PARQUET_DIR = testParquetDirectory;
process.env.FPL_USER_DATA_DIR = testUserDirectory;

const forecast = {
  expectedHomeGoals: 1.7,
  expectedAwayGoals: 0.9,
  homeWinProb: 0.52,
  drawProb: 0.24,
  awayWinProb: 0.24,
  over25Prob: 0.48,
  bttsProb: 0.46,
  topScorelines: [{ home: 2, away: 1, prob: 0.12 }],
};

let bookSelection: typeof import("../src/lib/bookings").bookSelection;
let createHydrationConnection: typeof import("../src/lib/db").createHydrationConnection;
let exportParquetDataset: typeof import("../src/lib/db").exportParquetDataset;
let listBookedPnlHistory: typeof import("../src/lib/booked-pnl").listBookedPnlHistory;
let gameweekBookedPnl: typeof import("../src/lib/booked-pnl").gameweekBookedPnl;
let resetReadConnection: typeof import("../src/lib/db").resetReadConnection;

beforeAll(async () => {
  ({ bookSelection } = await import("../src/lib/bookings"));
  ({ listBookedPnlHistory, gameweekBookedPnl } = await import("../src/lib/booked-pnl"));
  ({ createHydrationConnection, exportParquetDataset, resetReadConnection } = await import("../src/lib/db"));
});

function record(overrides: {
  id: string;
  gameweek: number | null;
  pnl: number | null;
  outcome?: "won" | "lost" | null;
}) {
  return {
    id: overrides.id,
    fixtureId: 1,
    gameweek: overrides.gameweek,
    homeShortName: "ALP",
    awayShortName: "BET",
    kickoffTime: null,
    market: "1X2" as const,
    selection: "home",
    odds: 2.1,
    stake: 10,
    outcome: overrides.outcome ?? (overrides.pnl === null ? null : overrides.pnl >= 0 ? "won" as const : "lost" as const),
    pnl: overrides.pnl,
    settledAt: overrides.pnl === null ? null : "2026-01-01T17:00:00.000Z",
    bookedAt: "2026-01-01T12:00:00.000Z",
  };
}

describe("gameweek booked pnl", () => {
  it("sums each realized gameweek and starts at the first one with a result", () => {
    const history = gameweekBookedPnl([
      record({ id: "open-early", gameweek: 3, pnl: null, outcome: null }),
      record({ id: "gw4-win", gameweek: 4, pnl: 11, outcome: "won" }),
      record({ id: "gw4-loss", gameweek: 4, pnl: -4, outcome: "lost" }),
      record({ id: "gw5-settled", gameweek: 5, pnl: 8, outcome: "won" }),
      record({ id: "gw5-open", gameweek: 5, pnl: null, outcome: null }),
      record({ id: "gw6-loss", gameweek: 6, pnl: -10, outcome: "lost" }),
    ]);

    expect(history.map((entry) => entry.gameweek)).toEqual([4, 6]);
    expect(history[0]).toMatchObject({ pnl: 7, runningPnl: 7, won: 1, lost: 1, betCount: 2 });
    expect(history[1]).toMatchObject({ pnl: -10, runningPnl: -3, won: 0, lost: 1, betCount: 1 });
  });
});

describe("booked pnl history", () => {
  it("starts at the first settled booking and skips open bets with null pnl", async () => {
    resetReadConnection();
    const connection = await createHydrationConnection();
    await connection.run(
      `INSERT INTO teams (season, team_id, name, short_name) VALUES
       ('2025-26', 1, 'Alpha FC', 'ALP'),
       ('2025-26', 2, 'Beta FC', 'BET'),
       ('2025-26', 3, 'Gamma FC', 'GAM'),
       ('2025-26', 4, 'Delta FC', 'DEL'),
       ('2025-26', 5, 'Epsilon FC', 'EPS'),
       ('2025-26', 6, 'Zeta FC', 'ZET')`,
    );
    await connection.run(
      `INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished)
       VALUES
       ('2025-26', 301, 3, 1, 2, NULL, NULL, false),
       ('2025-26', 401, 4, 3, 4, 2, 1, true),
       ('2025-26', 402, 4, 1, 2, 0, 1, true),
       ('2025-26', 601, 6, 5, 6, 0, 1, true)`,
    );
    await exportParquetDataset(connection);
    connection.closeSync();
    resetReadConnection();

    await bookSelection({
      fixtureId: 301,
      season: "2025-26",
      homeTeam: "Alpha FC",
      awayTeam: "Beta FC",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.1,
      forecast,
    });
    await bookSelection({
      fixtureId: 401,
      season: "2025-26",
      homeTeam: "Gamma FC",
      awayTeam: "Delta FC",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.1,
      forecast,
    });
    await bookSelection({
      fixtureId: 402,
      season: "2025-26",
      homeTeam: "Alpha FC",
      awayTeam: "Beta FC",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.1,
      forecast,
    });
    await bookSelection({
      fixtureId: 601,
      season: "2025-26",
      homeTeam: "Epsilon FC",
      awayTeam: "Zeta FC",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.1,
      forecast,
    });

    resetReadConnection();
    const history = await listBookedPnlHistory("2025-26");

    expect(history.map((entry) => entry.gameweek)).toEqual([4, 6]);
    expect(history[0]).toMatchObject({ won: 1, lost: 1, betCount: 2 });
    expect(history[0]?.pnl).toBeCloseTo(1, 5);
    expect(history[0]?.runningPnl).toBeCloseTo(1, 5);
    expect(history[1]).toMatchObject({ won: 0, lost: 1, betCount: 1 });
    expect(history[1]?.pnl).toBeCloseTo(-10, 5);
    expect(history[1]?.runningPnl).toBeCloseTo(-9, 5);
  });
});
