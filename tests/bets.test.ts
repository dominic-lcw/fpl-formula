import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-bets-${randomUUID()}`);
process.env.FPL_PARQUET_DIR = testParquetDirectory;

let addBet: typeof import("../src/lib/bets").addBet;
let deleteBet: typeof import("../src/lib/bets").deleteBet;
let listBets: typeof import("../src/lib/bets").listBets;
let resetReadConnection: typeof import("../src/lib/db").resetReadConnection;

beforeAll(async () => {
  ({ addBet, deleteBet, listBets } = await import("../src/lib/bets"));
  ({ resetReadConnection } = await import("../src/lib/db"));
});

describe("bet storage", () => {
  it("persists bets to parquet and reloads them", async () => {
    resetReadConnection();
    const bet = await addBet({
      fixtureId: 101,
      season: "2025-26",
      homeTeam: "Alpha",
      awayTeam: "Beta",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.1,
      forecast: {
        expectedHomeGoals: 1.7,
        expectedAwayGoals: 0.9,
        homeWinProb: 0.52,
        drawProb: 0.24,
        awayWinProb: 0.24,
        over25Prob: 0.48,
        bttsProb: 0.46,
        topScorelines: [{ home: 1, away: 0, prob: 0.14 }],
      },
      notes: "Test bet",
    });

    resetReadConnection();
    const bets = await listBets("2025-26");
    expect(bets.some((entry) => entry.id === bet.id)).toBe(true);
    expect(bets[0]?.expectedValue).toBeCloseTo(0.52 * 2.1 - 1, 5);

    await deleteBet(bet.id);
    resetReadConnection();
    const remaining = await listBets("2025-26");
    expect(remaining.some((entry) => entry.id === bet.id)).toBe(false);
  });
});
