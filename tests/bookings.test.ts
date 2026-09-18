import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import { gradeSelection, profitAndLoss } from "../src/lib/booking-settlement";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-bookings-${randomUUID()}`);
const testUserDirectory = path.join(tmpdir(), `fpl-formula-user-${randomUUID()}`);
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
let cancelBooking: typeof import("../src/lib/bookings").cancelBooking;
let listBookings: typeof import("../src/lib/bookings").listBookings;
let createHydrationConnection: typeof import("../src/lib/db").createHydrationConnection;
let exportParquetDataset: typeof import("../src/lib/db").exportParquetDataset;
let resetReadConnection: typeof import("../src/lib/db").resetReadConnection;

beforeAll(async () => {
  ({ bookSelection, cancelBooking, listBookings } = await import("../src/lib/bookings"));
  ({ createHydrationConnection, exportParquetDataset, resetReadConnection } = await import("../src/lib/db"));
});

describe("booking settlement", () => {
  it("grades each market from the final score and books net profit", () => {
    expect(gradeSelection("1X2", "home", 2, 1)).toBe("won");
    expect(gradeSelection("1X2", "draw", 0, 0)).toBe("won");
    expect(gradeSelection("1X2", "away", 2, 1)).toBe("lost");
    expect(gradeSelection("over_under", "over_2.5", 2, 1)).toBe("won");
    expect(gradeSelection("over_under", "under_2.5", 1, 0)).toBe("won");
    expect(gradeSelection("btts", "yes", 2, 1)).toBe("won");
    expect(gradeSelection("btts", "no", 2, 0)).toBe("won");
    expect(gradeSelection("correct_score", "2-1", 2, 1)).toBe("won");
    expect(gradeSelection("correct_score", "1-0", 2, 1)).toBe("lost");
    expect(profitAndLoss(10, 2.1, "won")).toBeCloseTo(11, 5);
    expect(profitAndLoss(10, 2.1, "lost")).toBe(-10);
  });

  it("keeps an open booking until the match result is available, then persists PnL", async () => {
    resetReadConnection();
    const connection = await createHydrationConnection();
    await connection.run(
      `INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished)
       VALUES ('2025-26', 101, 4, 1, 2, 2, 1, true)`,
    );
    await connection.run(
      `INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, finished)
       VALUES ('2025-26', 202, 5, 3, 4, false)`,
    );
    await exportParquetDataset(connection);
    connection.closeSync();
    resetReadConnection();

    const won = await bookSelection({
      fixtureId: 101,
      season: "2025-26",
      homeTeam: "Alpha",
      awayTeam: "Beta",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.1,
      forecast,
    });
    const lost = await bookSelection({
      fixtureId: 101,
      season: "2025-26",
      homeTeam: "Alpha",
      awayTeam: "Beta",
      market: "1X2",
      selection: "away",
      stake: 10,
      odds: 3,
      forecast,
    });
    const open = await bookSelection({
      fixtureId: 202,
      season: "2025-26",
      homeTeam: "Gamma",
      awayTeam: "Delta",
      market: "over_under",
      selection: "over_2.5",
      stake: 5,
      odds: 1.9,
      forecast,
      notes: "Still to be played",
    });

    await expect(stat(path.join(testUserDirectory, "bookings.parquet"))).resolves.toBeTruthy();
    await expect(stat(path.join(testParquetDirectory, "bookings.parquet"))).rejects.toThrow();

    resetReadConnection();
    const settled = await listBookings("2025-26");
    const wonRow = settled.find((entry) => entry.id === won.id);
    const lostRow = settled.find((entry) => entry.id === lost.id);
    const openRow = settled.find((entry) => entry.id === open.id);

    expect(wonRow).toMatchObject({ status: "settled", outcome: "won", homeScore: 2, awayScore: 1 });
    expect(wonRow?.pnl).toBeCloseTo(11, 5);
    expect(lostRow).toMatchObject({ status: "settled", outcome: "lost", pnl: -10 });
    expect(openRow).toMatchObject({ status: "open", outcome: null, pnl: null, homeScore: null });

    resetReadConnection();
    const reloaded = await listBookings("2025-26");
    expect(reloaded.find((entry) => entry.id === won.id)?.pnl).toBeCloseTo(11, 5);

    await cancelBooking(open.id);
    resetReadConnection();
    expect((await listBookings("2025-26")).some((entry) => entry.id === open.id)).toBe(false);
    await expect(cancelBooking(won.id)).rejects.toMatchObject({ status: 409 });
  });
});
