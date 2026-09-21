import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-slate-${randomUUID()}`);
const testUserDirectory = path.join(tmpdir(), `fpl-formula-slate-user-${randomUUID()}`);
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
let getGameweekSlate: typeof import("../src/lib/gameweek-slate").getGameweekSlate;
let resetReadConnection: typeof import("../src/lib/db").resetReadConnection;

beforeAll(async () => {
  ({ bookSelection } = await import("../src/lib/bookings"));
  ({ createHydrationConnection, exportParquetDataset, resetReadConnection } = await import("../src/lib/db"));
  ({ getGameweekSlate } = await import("../src/lib/gameweek-slate"));
});

describe("gameweek slate", () => {
  it("keeps played fixtures on the slate and shows settled profit and loss", async () => {
    resetReadConnection();
    const connection = await createHydrationConnection();
    await connection.run(
      `INSERT INTO teams (season, team_id, name, short_name) VALUES
       ('2025-26', 1, 'Alpha FC', 'ALP'),
       ('2025-26', 2, 'Beta FC', 'BET')`,
    );
    await connection.run(
      `INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished)
       VALUES
       ('2025-26', 501, 5, 1, 2, 2, 1, true),
       ('2025-26', 502, 5, 1, 2, NULL, NULL, false)`,
    );
    await exportParquetDataset(connection);
    connection.closeSync();
    resetReadConnection();

    await bookSelection({
      fixtureId: 501,
      season: "2025-26",
      homeTeam: "Alpha FC",
      awayTeam: "Beta FC",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.1,
      forecast,
    });

    resetReadConnection();
    const slate = await getGameweekSlate("2025-26", 5, {
      lookbackGameweeks: 8,
      homeAdvantage: 1.12,
      correlation: 0.08,
      simulations: 5000,
      fplStrengthBlend: 0.35,
    });

    expect(slate.rows).toHaveLength(2);
    const played = slate.rows.find((row) => row.fixtureId === 501);
    expect(played?.booking).toMatchObject({ status: "settled", outcome: "won", pnl: 11, homeScore: 2, awayScore: 1 });
    expect(slate.summary.settledPnl).toBeCloseTo(11, 5);
    expect(slate.summary.openCount).toBe(0);
  });
});
