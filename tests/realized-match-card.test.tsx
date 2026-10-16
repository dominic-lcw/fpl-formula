import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RealizedMatchCard } from "../src/components/match-forecast";
import type { BookingRecord } from "../src/lib/booking-settlement";
import type { GameweekSlateRow } from "../src/lib/gameweek-slate";

function row(overrides: Partial<GameweekSlateRow> = {}): GameweekSlateRow {
  return {
    fixtureId: 501,
    gameweek: 5,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeShortName: "ARS",
    awayShortName: "CHE",
    kickoffTime: "2025-09-20T14:00:00.000Z",
    finished: true,
    homeScore: 2,
    awayScore: 1,
    modelPick: null,
    modelScoreline: null,
    expectedHomeGoals: null,
    expectedAwayGoals: null,
    booking: null,
    ...overrides,
  };
}

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: "booking-501",
    fixtureId: 501,
    season: "2025-26",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    market: "1X2",
    selection: "home",
    stake: 10,
    odds: 2.1,
    expectedHomeGoals: 1.62,
    expectedAwayGoals: 0.94,
    modelProb: 0.54,
    expectedValue: 0.13,
    notes: null,
    bookedAt: "2025-09-19T12:00:00.000Z",
    status: "settled",
    homeScore: 2,
    awayScore: 1,
    outcome: "won",
    pnl: 11,
    settledAt: "2025-09-20T16:00:00.000Z",
    ...overrides,
  };
}

describe("RealizedMatchCard", () => {
  it("shows the final score and booked profit for a finished gameweek", () => {
    const html = renderToStaticMarkup(<RealizedMatchCard row={row({ booking: booking() })} />);

    expect(html).toContain("GW5");
    expect(html).toContain("ARS");
    expect(html).toContain("CHE");
    expect(html).toContain("2–1");
    expect(html).toContain("Won");
    expect(html).toContain("Forecast when booked");
    expect(html).toContain("Home win");
    expect(html).toContain("54.0%");
    expect(html).toContain("2.10");
    expect(html).toContain("+$11.00");
  });

  it("shows a played match that was never booked", () => {
    const html = renderToStaticMarkup(<RealizedMatchCard row={row()} />);

    expect(html).toContain("2–1");
    expect(html).toContain("Played");
    expect(html).toContain("No bet was booked");
    expect(html).not.toContain("Forecast when booked");
    expect(html).not.toContain("Model score");
  });

  it("shows the pre-match scoreline for a played match", () => {
    const html = renderToStaticMarkup(<RealizedMatchCard row={row({
      modelScoreline: { home: 1, away: 1, probability: 0.11 },
      expectedHomeGoals: 1.61,
      expectedAwayGoals: 1.59,
    })} />);

    expect(html).toContain("Model score");
    expect(html).toContain("1–1");
    expect(html).toContain("11.0%");
    expect(html).toContain("Expected 1.61–1.59");
  });
});
