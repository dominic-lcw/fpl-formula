import { describe, expect, it } from "vitest";
import { beforeEach } from "vitest";
import { gradeSelection, highestMatchOutcome, profitAndLoss } from "../src/lib/booking-settlement";
import { bookSelection, bookSelections, cancelBooking, listBookings, resolveOpenBookings } from "../src/lib/bookings";
import { query, resetTestDatabase, run } from "../src/lib/db";

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

async function seedFixtures() {
  await run(
    `INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished)
     VALUES
       ('2025-26', 101, 4, 1, 2, 2, 1, true),
       ('2025-26', 202, 5, 3, 4, NULL, NULL, false)`,
  );
}

describe("booking settlement", () => {
  it("grades each market from the final score and books net profit", async () => {
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
    expect(highestMatchOutcome({ homeWinProb: 0.2, drawProb: 0.3, awayWinProb: 0.5 })).toMatchObject({
      selection: "away",
      probability: 0.5,
    });
    expect(highestMatchOutcome({ homeWinProb: 0.4, drawProb: 0.4, awayWinProb: 0.2 }).selection).toBe("home");
  });

  it("keeps an open booking until the match result is available, then persists PnL", async () => {
    await seedFixtures();

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

    const stored = await query<{ count: number }>(`SELECT count(*)::INTEGER AS count FROM bookings`);
    expect(stored[0]?.count).toBe(3);

    const settled = await listBookings("2025-26");
    const wonRow = settled.find((entry) => entry.id === won.id);
    const lostRow = settled.find((entry) => entry.id === lost.id);
    const openRow = settled.find((entry) => entry.id === open.id);

    expect(wonRow).toMatchObject({ status: "settled", outcome: "won", homeScore: 2, awayScore: 1 });
    expect(wonRow?.pnl).toBeCloseTo(11, 5);
    expect(lostRow).toMatchObject({ status: "settled", outcome: "lost", pnl: -10 });
    expect(openRow).toMatchObject({ status: "open", outcome: null, pnl: null, homeScore: null });

    const reloaded = await listBookings("2025-26");
    expect(reloaded.find((entry) => entry.id === won.id)?.pnl).toBeCloseTo(11, 5);

    await cancelBooking(open.id);
    expect((await listBookings("2025-26")).some((entry) => entry.id === open.id)).toBe(false);
    await expect(cancelBooking(won.id)).rejects.toMatchObject({ status: 409 });
  });

  it("keeps provisional results open until resolve is called", async () => {
    await run(
      `INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished)
       VALUES ('2025-26', 303, 5, 4, 6, 3, 0, false)`,
    );

    const provisional = await bookSelection({
      fixtureId: 303,
      season: "2025-26",
      homeTeam: "Brentford",
      awayTeam: "Chelsea",
      market: "1X2",
      selection: "home",
      stake: 10,
      odds: 2.4,
      forecast,
    });

    const stillOpen = await listBookings("2025-26");
    expect(stillOpen.find((entry) => entry.id === provisional.id)).toMatchObject({
      status: "open",
      homeScore: null,
      awayScore: null,
    });

    const resolved = await resolveOpenBookings();
    expect(resolved).toMatchObject({ settled: 1, remaining: 0, persistedFixtures: 1 });

    const settled = await listBookings("2025-26");
    expect(settled.find((entry) => entry.id === provisional.id)).toMatchObject({
      status: "settled",
      outcome: "won",
      homeScore: 3,
      awayScore: 0,
      pnl: 14,
    });
  });

  it("books several top results in one write and skips ones already open", async () => {
    const first = await bookSelections([
      {
        fixtureId: 301,
        season: "2025-26",
        homeTeam: "City",
        awayTeam: "Town",
        market: "1X2",
        selection: "home",
        stake: 10,
        odds: 1.8,
        forecast,
      },
      {
        fixtureId: 302,
        season: "2025-26",
        homeTeam: "Town",
        awayTeam: "City",
        market: "1X2",
        selection: "away",
        stake: 10,
        odds: 2.4,
        forecast,
      },
    ]);
    expect(first).toHaveLength(2);

    const again = await bookSelections([
      {
        fixtureId: 301,
        season: "2025-26",
        homeTeam: "City",
        awayTeam: "Town",
        market: "1X2",
        selection: "home",
        stake: 10,
        odds: 1.8,
        forecast,
      },
    ]);
    expect(again).toHaveLength(0);

    const listed = await listBookings("2025-26");
    expect(listed.filter((entry) => entry.fixtureId === 301 && entry.status === "open")).toHaveLength(1);
    await cancelBooking(first[0]!.id);
    await cancelBooking(first[1]!.id);
  });
});
