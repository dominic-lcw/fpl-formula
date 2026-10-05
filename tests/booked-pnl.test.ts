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
let settledBookedPnl: typeof import("../src/lib/booked-pnl").settledBookedPnl;
let resetReadConnection: typeof import("../src/lib/db").resetReadConnection;

beforeAll(async () => {
  ({ bookSelection } = await import("../src/lib/bookings"));
  ({ listBookedPnlHistory, settledBookedPnl } = await import("../src/lib/booked-pnl"));
  ({ createHydrationConnection, exportParquetDataset, resetReadConnection } = await import("../src/lib/db"));
});

describe("settled booked pnl", () => {
  it("starts at the first non-null pnl and keeps a running total", () => {
    const history = settledBookedPnl([
      {
        id: "open-early",
        fixtureId: 1,
        gameweek: 3,
        homeShortName: "ALP",
        awayShortName: "BET",
        kickoffTime: "2026-01-01T15:00:00.000Z",
        market: "1X2",
        selection: "home",
        odds: 2.1,
        stake: 10,
        outcome: null,
        pnl: null,
        settledAt: null,
        bookedAt: "2025-12-01T12:00:00.000Z",
      },
      {
        id: "loss",
        fixtureId: 3,
        gameweek: 6,
        homeShortName: "EPS",
        awayShortName: "ZET",
        kickoffTime: "2026-02-01T15:00:00.000Z",
        market: "1X2",
        selection: "home",
        odds: 2.1,
        stake: 10,
        outcome: "lost",
        pnl: -10,
        settledAt: "2026-02-01T17:00:00.000Z",
        bookedAt: "2026-02-01T12:00:00.000Z",
      },
      {
        id: "open-middle",
        fixtureId: 2,
        gameweek: 5,
        homeShortName: "GAM",
        awayShortName: "DEL",
        kickoffTime: "2026-01-20T15:00:00.000Z",
        market: "1X2",
        selection: "home",
        odds: 2.1,
        stake: 10,
        outcome: null,
        pnl: null,
        settledAt: null,
        bookedAt: "2026-01-20T12:00:00.000Z",
      },
      {
        id: "win",
        fixtureId: 4,
        gameweek: 4,
        homeShortName: "GAM",
        awayShortName: "DEL",
        kickoffTime: "2026-01-10T15:00:00.000Z",
        market: "1X2",
        selection: "home",
        odds: 2.1,
        stake: 10,
        outcome: "won",
        pnl: 11,
        settledAt: "2026-01-10T17:00:00.000Z",
        bookedAt: "2026-01-10T12:00:00.000Z",
      },
    ]);

    expect(history.map((entry) => entry.id)).toEqual(["win", "loss"]);
    expect(history[0]).toMatchObject({ gameweek: 4, pnl: 11, runningPnl: 11 });
    expect(history[1]).toMatchObject({ gameweek: 6, pnl: -10, runningPnl: 1 });
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

    expect(history.map((entry) => entry.fixtureId)).toEqual([401, 601]);
    expect(history[0]).toMatchObject({
      gameweek: 4,
      homeShortName: "GAM",
      awayShortName: "DEL",
      outcome: "won",
    });
    expect(history[0]?.pnl).toBeCloseTo(11, 5);
    expect(history[0]?.runningPnl).toBeCloseTo(11, 5);
    expect(history[1]).toMatchObject({
      gameweek: 6,
      homeShortName: "EPS",
      awayShortName: "ZET",
      outcome: "lost",
    });
    expect(history[1]?.pnl).toBeCloseTo(-10, 5);
    expect(history[1]?.runningPnl).toBeCloseTo(1, 5);
  });
});
