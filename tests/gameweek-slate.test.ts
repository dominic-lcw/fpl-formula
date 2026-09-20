import { beforeEach, describe, expect, it } from "vitest";
import { bookSelection } from "../src/lib/bookings";
import { getGameweekSlate } from "../src/lib/gameweek-slate";
import { resetTestDatabase, run } from "../src/lib/db";

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

beforeEach(async () => {
  await resetTestDatabase();
});

describe("gameweek slate", () => {
  it("keeps played fixtures on the slate and shows settled profit and loss", async () => {
    await run(
      `INSERT INTO teams (season, team_id, name, short_name) VALUES
       ('2025-26', 1, 'Alpha FC', 'ALP'),
       ('2025-26', 2, 'Beta FC', 'BET')`,
    );
    await run(
      `INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished)
       VALUES
       ('2025-26', 501, 5, 1, 2, 2, 1, true),
       ('2025-26', 502, 5, 1, 2, NULL, NULL, false)`,
    );

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
