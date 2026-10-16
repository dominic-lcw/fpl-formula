import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameweekBookingsView, pendingRowsWithOpenOdds } from "../src/components/match-forecast";
import { buildKellyPlan } from "../src/lib/kelly";
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

function renderBookings(
  rows: GameweekSlateRow[],
  overrides: Partial<Parameters<typeof GameweekBookingsView>[0]> = {},
) {
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
      onBookRow={() => {}}
      onPriceOpenChange={() => {}}
      onClear={() => {}}
      resolveMessage={null}
      onResolve={() => {}}
      {...overrides}
    />,
  );
}

describe("bookings scatterplot", () => {
  it("hides the scatterplot until a selection has been booked", () => {
    const html = renderBookings([row()]);
    expect(html).toContain("Gameweek 24");
    expect(html).toContain("Clear GW24");
    expect(html).toMatch(/data-clear-gameweek=""[^>]*disabled=""/);
    expect(html).not.toContain("Live resolve");
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
    expect(html).toContain("Live resolve");
    expect(html).not.toMatch(/data-resolve-live=""[^>]*disabled=""/);
    expect(html).not.toMatch(/data-clear-gameweek=""[^>]*disabled=""/);
  });

  it("shows live resolve for open bookings outside the current slate", () => {
    const html = renderToStaticMarkup(
      <GameweekBookingsView
        summary={{ ...summary, openCount: 0, openStake: 0 }}
        gameweek={24}
        rows={[row({ booking: booking({ status: "settled", outcome: "won", pnl: 11, homeScore: 2, awayScore: 0 }) })]}
        stake="10"
        defaultOdds="2.10"
        rowOdds={{}}
        isBooking={false}
        isClearing={false}
        onStakeChange={() => {}}
        onDefaultOddsChange={() => {}}
        onRowOddsChange={() => {}}
        onBookAll={() => {}}
        onBookRow={() => {}}
        onPriceOpenChange={() => {}}
        onClear={() => {}}
        canResolve
        isResolving={false}
        resolveMessage="No results were available yet. 1 booking still open."
        onResolve={() => {}}
      />,
    );

    expect(html).toContain("Live resolve");
    expect(html).toContain("No results were available yet. 1 booking still open.");
    expect(html).toContain("data-resolve-message");
  });

  it("offers a book button for each unbooked match and leaves booked or played rows alone", () => {
    const html = renderBookings([
      row(),
      row({
        fixtureId: 11,
        homeShortName: "TOT",
        awayShortName: "NEW",
        booking: booking({ fixtureId: 11 }),
      }),
      row({
        fixtureId: 12,
        homeShortName: "MCI",
        awayShortName: "LIV",
        finished: true,
        modelPick: { market: "1X2", selection: "home", probability: 0.4 },
      }),
    ]);

    expect(html).toContain("Largest chance");
    expect(html).toContain("even when that chance is below the price");
    expect(html).toContain("Stake for each match");
    expect(html).not.toContain("data-kelly-list");
    expect(html).toContain('data-book-row="10"');
    expect(html).toContain('data-price-open="10"');
    expect(html).toContain("Book 1 match");
    expect(html).not.toContain('data-book-row="11"');
    expect(html).not.toContain('data-book-row="12"');
    expect(html).not.toContain("data-left-out");
  });

  it("leaves a closed price out of the gameweek book and disables its row button", () => {
    const html = renderBookings(
      [
        row(),
        row({ fixtureId: 11, homeShortName: "TOT", awayShortName: "NEW" }),
      ],
      { priceClosed: { 11: true } },
    );

    expect(html).toContain("Book 1 match");
    expect(html).toContain("1 match left out until the price is open.");
    expect(html).toContain('data-book-row="10"');
    expect(html).toMatch(/data-book-row="11"[^>]*disabled=""/);
    expect(html).toMatch(/data-price-open="11"(?![^>]*checked)/);
  });

  it("disables a row book button when that match has no usable odds", () => {
    const html = renderBookings([row()], { rowOdds: { 10: "" } });
    expect(html).toMatch(/data-book-row="10"[^>]*disabled=""/);
    expect(html).toContain("Book 1 match");
  });
});

describe("Kelly list", () => {
  it("lists only prices with an edge and shows each stake from the capital", () => {
    const plan = buildKellyPlan(
      [
        { fixtureId: 10, probability: 0.55, odds: 2.1 },
        { fixtureId: 11, probability: 0.4, odds: 2.1 },
      ],
      1000,
    );
    const html = renderBookings(
      [
        row({ modelPick: { market: "1X2", selection: "home", probability: 0.55 } }),
        row({
          fixtureId: 11,
          homeShortName: "TOT",
          awayShortName: "NEW",
          modelPick: { market: "1X2", selection: "away", probability: 0.4 },
        }),
      ],
      {
        strategy: "kelly",
        capital: "1000",
        kellyBets: plan.bets,
        kellyPassed: plan.passed,
        kellyScaled: plan.scaled,
      },
    );

    expect(html).toContain("To pay");
    expect(html).toContain('data-to-pay=""');
    expect(html).toContain("Book · pay $140.91");
    expect(html).toContain('data-kelly-row="10"');
    expect(html).toContain("$140.91");
    expect(html).toContain("1 open price has no edge and stays off the list.");
    expect(html).toContain('data-kelly-passed-row="11"');
    expect(html).toMatch(/data-book-row="11"[^>]*disabled=""/);
    expect(html).not.toContain('data-kelly-row="11"');
    expect(html).toContain("Stake to place");
    expect(html).toContain("Largest chance");
  });

  it("still books a largest-chance pick when the model is below the price", () => {
    const html = renderBookings(
      [row({ modelPick: { market: "1X2", selection: "home", probability: 0.4 } })],
      { rowOdds: { 10: "2.10" }, stake: "15" },
    );

    expect(html).toContain('data-below-price="10"');
    expect(html).toContain("Below the price");
    expect(html).toContain("$15.00");
    expect(html).toContain("Book 1 match");
    expect(html).not.toMatch(/data-book-row="10"[^>]*disabled=""/);
  });

  it("uses the entered stake on largest chance even when Kelly would price the same match", () => {
    const plan = buildKellyPlan([{ fixtureId: 10, probability: 0.4, odds: 2.1 }], 1000);
    const html = renderBookings(
      [row({ modelPick: { market: "1X2", selection: "home", probability: 0.4 } })],
      { strategy: "largest", stake: "15", rowOdds: { 10: "2.10" }, kellyBets: plan.bets, kellyPassed: 1 },
    );

    expect(plan.bets).toEqual([]);
    expect(html).toContain("$15.00");
    expect(html).toContain("Below the price");
    expect(html).not.toContain("No edge");
    expect(html).not.toContain("data-kelly-list");
    expect(html).not.toMatch(/data-book-row="10"[^>]*disabled=""/);
  });
});

describe("open prices", () => {
  it("keeps only pending matches whose price is open and whose odds are usable", () => {
    const rows = [
      row(),
      row({ fixtureId: 11 }),
      row({ fixtureId: 12, booking: booking({ fixtureId: 12 }) }),
      row({ fixtureId: 13, finished: true }),
    ];

    expect(pendingRowsWithOpenOdds(rows, { 11: "1" }, "2.10", { 10: true }).map((item) => item.fixtureId)).toEqual([]);
    expect(pendingRowsWithOpenOdds(rows, { 11: "3.5" }, "2.10").map((item) => item.fixtureId)).toEqual([10, 11]);
  });
});
