import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookedPnlStrip, MatchdayOnePagerView } from "../src/components/matchday-one-pager";
import type { GameweekBookedPnl } from "../src/lib/booked-pnl";
import type { BookingRecord } from "../src/lib/booking-settlement";
import { renderMatchdayHtml } from "../src/lib/matchday-html";
import { buildMatchdayOnePager, type MatchdaySlateLike } from "../src/lib/matchday-one-pager";
import type { FixtureForecast } from "../src/lib/match-forecast-model";

function booking(overrides: Partial<BookingRecord> & Pick<BookingRecord, "fixtureId">): BookingRecord {
  return {
    id: `booking-${overrides.fixtureId}`,
    season: "2025-26",
    homeTeam: "Alpha",
    awayTeam: "Beta",
    market: "1X2",
    selection: "home",
    stake: 10,
    odds: 2.1,
    expectedHomeGoals: 1.4,
    expectedAwayGoals: 0.8,
    modelProb: 0.52,
    expectedValue: 0.092,
    notes: null,
    bookedAt: "2026-01-01T12:00:00.000Z",
    status: "open",
    homeScore: null,
    awayScore: null,
    outcome: null,
    pnl: null,
    settledAt: null,
    ...overrides,
  };
}

function forecast(overrides: Partial<FixtureForecast> & Pick<FixtureForecast, "fixtureId" | "event">): FixtureForecast {
  return {
    kickoffTime: "2026-02-01T15:00:00.000Z",
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeam: "Alpha",
    awayTeam: "Beta",
    homeShortName: "ALP",
    awayShortName: "BET",
    expectedHomeGoals: 1.7,
    expectedAwayGoals: 0.9,
    homeWinProb: 0.52,
    drawProb: 0.24,
    awayWinProb: 0.24,
    over25Prob: 0.48,
    bttsProb: 0.46,
    topScorelines: [{ home: 2, away: 1, prob: 0.12 }, { home: 1, away: 0, prob: 0.1 }],
    lambdaHome: 1.7,
    lambdaAway: 0.9,
    lambdaShared: 0.1,
    ...overrides,
  };
}

describe("matchday one-pager", () => {
  it("includes the forecast and model bet, and odds only once they are booked", () => {
    const page = buildMatchdayOnePager({
      season: "2025-26",
      gameweek: 8,
      forecasts: [
        forecast({ fixtureId: 1, event: 8, homeShortName: "ARS", awayShortName: "CHE" }),
        forecast({
          fixtureId: 2,
          event: 8,
          homeTeam: "Liverpool",
          awayTeam: "Spurs",
          homeShortName: "LIV",
          awayShortName: "TOT",
          homeWinProb: 0.2,
          drawProb: 0.25,
          awayWinProb: 0.55,
        }),
      ],
      bookings: [
        booking({
          fixtureId: 2,
          market: "1X2",
          selection: "away",
          odds: 1.9,
          stake: 15,
          modelProb: 0.55,
          expectedValue: 0.045,
          homeTeam: "Liverpool",
          awayTeam: "Spurs",
        }),
      ],
      slateRows: [],
    });

    expect(page.matches).toHaveLength(2);
    const unbooked = page.matches.find((match) => match.fixtureId === 1);
    expect(unbooked?.forecast).toMatchObject({
      source: "model",
      predictedWinner: "ARS win",
      mostLikelyScore: "2-1",
    });
    expect(unbooked?.bet).toMatchObject({ label: "ARS win", placed: false });
    expect(unbooked?.bookedOdds).toBeNull();

    const booked = page.matches.find((match) => match.fixtureId === 2);
    expect(booked?.bet).toMatchObject({ label: "TOT win", placed: true, selection: "away" });
    expect(booked?.bookedOdds).toMatchObject({ odds: 1.9, stake: 15, status: "open", pnl: null });
    expect(page.bookedCount).toBe(1);
    expect(page.stake).toBe(15);
  });

  it("uses the booked forecast snapshot when the live model no longer has the fixture", () => {
    const slate: MatchdaySlateLike[] = [{
      fixtureId: 9,
      gameweek: 4,
      kickoffTime: "2026-01-04T15:00:00.000Z",
      homeTeam: "Alpha",
      awayTeam: "Beta",
      homeShortName: "ALP",
      awayShortName: "BET",
      booking: booking({
        fixtureId: 9,
        status: "settled",
        outcome: "won",
        pnl: 11,
        homeScore: 2,
        awayScore: 1,
        odds: 2.1,
        settledAt: "2026-01-04T17:00:00.000Z",
      }),
    }];

    const page = buildMatchdayOnePager({
      season: "2025-26",
      gameweek: 4,
      forecasts: [forecast({ fixtureId: 99, event: 8 })],
      bookings: [],
      slateRows: slate,
    });

    expect(page.matches).toHaveLength(1);
    expect(page.matches[0]?.forecast).toMatchObject({
      source: "booked",
      expectedHomeGoals: 1.4,
      predictedWinner: "ALP win",
    });
    expect(page.matches[0]?.bookedOdds).toMatchObject({ odds: 2.1, pnl: 11, homeScore: 2, awayScore: 1 });
    expect(page.matches[0]?.result).toEqual({ homeScore: 2, awayScore: 1 });
    expect(page.realized).toBe(true);
    expect(page.settledPnl).toBe(11);

    const html = renderToStaticMarkup(
      <MatchdayOnePagerView
        page={page}
        pnlHistory={[
          { gameweek: 4, pnl: 11, runningPnl: 11, won: 1, lost: 0, betCount: 1 },
          { gameweek: 6, pnl: -10, runningPnl: 1, won: 0, lost: 1, betCount: 1 },
        ]}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("PnL +$11.00");
    expect(html).toContain("2–1");
    expect(html).toContain("Forecast when booked");
    expect(html).toContain("ALP win");
    expect(html.indexOf(">GW4<")).toBeLessThan(html.indexOf(">GW6<"));
  });

  it("renders the one-pager with booked odds and a horizontal pnl strip that starts at the first result", () => {
    const page = buildMatchdayOnePager({
      season: "2025-26",
      gameweek: 8,
      forecasts: [
        forecast({ fixtureId: 1, event: 8, homeShortName: "ARS", awayShortName: "CHE" }),
        forecast({ fixtureId: 3, event: 8, homeShortName: "MCI", awayShortName: "NEW", homeTeam: "Man City", awayTeam: "Newcastle" }),
      ],
      bookings: [booking({ fixtureId: 1, odds: 2.4, stake: 10, selection: "home" })],
      slateRows: [],
    });
    const history: GameweekBookedPnl[] = [
      { gameweek: 4, pnl: 11, runningPnl: 11, won: 1, lost: 0, betCount: 1 },
      { gameweek: 6, pnl: -10, runningPnl: 1, won: 0, lost: 1, betCount: 1 },
    ];

    const html = renderToStaticMarkup(
      <MatchdayOnePagerView page={page} pnlHistory={history} onClose={() => undefined} />,
    );

    expect(html).toContain("Matchday one-pager");
    expect(html).toContain("Save HTML");
    expect(html).not.toContain("Print");
    expect(html).toContain("Gameweek 8");
    expect(html).toContain("ARS win");
    expect(html).toContain("Odds booked");
    expect(html).toContain("2.40");
    expect(html).toContain("Booked PnL");
    expect(html.indexOf(">GW4<")).toBeLessThan(html.indexOf(">GW6<"));
    expect(html).toContain("+$11.00");
    expect(html).toContain("-$10.00");
    expect(html.split("Odds booked")).toHaveLength(2);
    expect(html).toContain('class="flex gap-2 overflow-x-auto pb-1"');

    const strip = renderToStaticMarkup(<BookedPnlStrip entries={[]} />);
    expect(strip).toContain("No realized gameweeks yet");
  });

  it("saves a phone HTML file with the gameweek data embedded", () => {
    const page = buildMatchdayOnePager({
      season: "2025-26",
      gameweek: 6,
      forecasts: [],
      bookings: [],
      slateRows: [{
        fixtureId: 9,
        gameweek: 6,
        kickoffTime: "2026-02-07T15:00:00.000Z",
        homeTeam: "Alpha <script>",
        awayTeam: "Beta",
        homeShortName: "ALP",
        awayShortName: "BET",
        booking: booking({
          fixtureId: 9,
          status: "settled",
          outcome: "won",
          pnl: 11,
          odds: 2.1,
          homeScore: 2,
          awayScore: 1,
          homeTeam: "Alpha <script>",
          awayTeam: "Beta",
        }),
      }],
    });
    const file = renderMatchdayHtml(page, [
      { gameweek: 6, pnl: 11, runningPnl: 11, won: 1, lost: 0, betCount: 1 },
    ]);

    expect(file).toContain('name="viewport"');
    expect(file).not.toContain("<link");
    expect(file).toContain("Alpha &lt;script&gt;");
    expect(file).toContain("2–1");
    expect(file).toContain("+$11.00");
    expect(file).toContain("Odds booked");

    const json = file.match(/<script type="application\/json" id="matchday-data">([\s\S]*?)<\/script>/)?.[1];
    const data = JSON.parse(json ?? "") as { gameweek: number; settledPnl: number; matches: Array<{ homeTeam: string; odds: string }> };
    expect(data.gameweek).toBe(6);
    expect(data.settledPnl).toBe(11);
    expect(data.matches[0]).toMatchObject({ homeTeam: "Alpha <script>", odds: "2.10" });
    expect(file).not.toContain("<script>");
  });
});
