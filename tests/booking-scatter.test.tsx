import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameweekBookingsView } from "../src/components/match-forecast";
import type { BookingRecord } from "../src/lib/booking-settlement";
import type { GameweekSlateRow, GameweekSlateSummary } from "../src/lib/gameweek-slate";

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: "booking-1",
    fixtureId: 10,
    season: "2025-26",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    market: "1X2",
    selection: "home",
    stake: 10,
    odds: 2.1,
    expectedHomeGoals: 1.6,
    expectedAwayGoals: 0.9,
    modelProb: 0.55,
    expectedValue: 0.155,
    notes: null,
    bookedAt: "2026-02-01T12:00:00.000Z",
    status: "open",
    homeScore: null,
    awayScore: null,
    outcome: null,
    pnl: null,
    settledAt: null,
    ...overrides,
  };
}

function row(overrides: Partial<GameweekSlateRow> = {}): GameweekSlateRow {
  return {
    fixtureId: 10,
    gameweek: 24,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeShortName: "ARS",
    awayShortName: "CHE",
    kickoffTime: "2026-02-01T15:00:00.000Z",
    finished: false,
    homeScore: null,
    awayScore: null,
    modelPick: { market: "1X2", selection: "home", probability: 0.55 },
    modelScoreline: { home: 1, away: 0, probability: 0.12 },
    expectedHomeGoals: 1.6,
    expectedAwayGoals: 0.9,
    booking: null,
    ...overrides,
  };
}

const summary: GameweekSlateSummary = {
  settledPnl: 0,
  openStake: 10,
  settledCount: 0,
  openCount: 1,
  won: 0,
  lost: 0,
  unbookedCount: 0,
};

function renderBookings(rows: GameweekSlateRow[]) {
  return renderToStaticMarkup(
    <GameweekBookingsView
      summary={summary}
      gameweek={24}
      rows={rows}
      stake="10"
      defaultOdds="2.10"
      rowOdds={{}}
      isBooking={false}
      isClearing={false}
      onStakeChange={() => {}}
      onDefaultOddsChange={() => {}}
      onRowOddsChange={() => {}}
      onBookAll={() => {}}
      onClear={() => {}}
    />,
  );
}

describe("bookings scatterplot", () => {
  it("hides the scatterplot until a selection has been booked", () => {
    const html = renderBookings([row()]);
    expect(html).toContain("Gameweek 24");
    expect(html).toContain("Clear GW24");
    expect(html).toMatch(/data-clear-gameweek=""[^>]*disabled=""/);
    expect(html).not.toContain("Model vs implied probability");
    expect(html).not.toContain("booking-probability-scatter");
  });

  it("shows the scatterplot after the booking table once odds are booked", () => {
    const html = renderBookings([row({ booking: booking() })]);
    const tableAt = html.indexOf("Gameweek 24");
    const scatterAt = html.indexOf("Model vs implied probability");

    expect(tableAt).toBeGreaterThan(-1);
    expect(scatterAt).toBeGreaterThan(tableAt);
    expect(html).toContain("booking-probability-scatter");
    expect(html).toContain("Scatter plot comparing model probability against implied probability");
    expect(html).toContain("ARS vs CHE");
    expect(html).toContain("Clear GW24");
    expect(html).not.toMatch(/data-clear-gameweek=""[^>]*disabled=""/);
  });
});
