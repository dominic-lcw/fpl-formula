import { highestMatchOutcome, type BookingMarket, type BookingRecord } from "@/lib/booking-settlement";
import { listBookings } from "@/lib/bookings";
import { query } from "@/lib/db";
import { getForecastData, type ForecastParams } from "@/lib/match-forecast";

export type GameweekSlateRow = {
  fixtureId: number;
  gameweek: number;
  homeTeam: string;
  awayTeam: string;
  homeShortName: string;
  awayShortName: string;
  kickoffTime: string | null;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
  modelPick: {
    market: BookingMarket;
    selection: string;
    probability: number;
  } | null;
  booking: BookingRecord | null;
};

export type GameweekSlateSummary = {
  settledPnl: number;
  openStake: number;
  settledCount: number;
  openCount: number;
  won: number;
  lost: number;
  unbookedCount: number;
};

type FixtureRow = {
  fixture_id: number;
  event: number;
  kickoff_time: Date | string | null;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  home_team: string;
  away_team: string;
  home_short: string;
  away_short: string;
};

function summarizeSlate(rows: GameweekSlateRow[]): GameweekSlateSummary {
  return rows.reduce(
    (totals, row) => {
      if (!row.booking) {
        if (!row.finished) totals.unbookedCount += 1;
        return totals;
      }
      if (row.booking.status === "open") {
        totals.openCount += 1;
        totals.openStake += row.booking.stake;
        return totals;
      }
      totals.settledCount += 1;
      totals.settledPnl += row.booking.pnl ?? 0;
      if (row.booking.outcome === "won") totals.won += 1;
      if (row.booking.outcome === "lost") totals.lost += 1;
      return totals;
    },
    { settledPnl: 0, openStake: 0, settledCount: 0, openCount: 0, won: 0, lost: 0, unbookedCount: 0 },
  );
}

export async function listBookingGameweeks(season: string) {
  const rows = await query<{ event: number }>(
    `SELECT DISTINCT f.event
     FROM fixtures f
     WHERE f.season = ?
       AND (
         f.finished = false
         OR EXISTS (SELECT 1 FROM bookings b WHERE b.fixture_id = f.fixture_id AND b.season = f.season)
       )
     ORDER BY f.event`,
    [season],
  );
  return rows.map((row) => row.event);
}

export async function getGameweekSlate(
  season: string,
  gameweek: number,
  params: ForecastParams,
  bookings?: BookingRecord[],
): Promise<{ rows: GameweekSlateRow[]; summary: GameweekSlateSummary; availableGameweeks: number[] }> {
  const resolvedBookings = bookings ?? await listBookings(season);
  const [fixtures, forecast, availableGameweeks] = await Promise.all([
    query<FixtureRow>(
      `SELECT f.fixture_id, f.event, f.kickoff_time, f.team_h_score, f.team_a_score, f.finished,
              th.name AS home_team, th.short_name AS home_short,
              ta.name AS away_team, ta.short_name AS away_short
       FROM fixtures f
       JOIN teams th ON th.season = f.season AND th.team_id = f.team_h
       JOIN teams ta ON ta.season = f.season AND ta.team_id = f.team_a
       WHERE f.season = ? AND f.event = ?
       ORDER BY f.kickoff_time NULLS LAST, f.fixture_id`,
      [season, gameweek],
    ),
    getForecastData(params, { gameweek }),
    listBookingGameweeks(season),
  ]);

  const bookingByFixture = new Map(
    resolvedBookings.filter((booking) => booking.fixtureId).map((booking) => [booking.fixtureId, booking]),
  );
  const forecastById = new Map(forecast.upcomingFixtures.map((fixture) => [fixture.fixtureId, fixture]));

  const rows: GameweekSlateRow[] = fixtures.map((fixture) => {
    const forecastFixture = forecastById.get(fixture.fixture_id);
    const modelPick = forecastFixture
      ? highestMatchOutcome(forecastFixture)
      : null;

    return {
      fixtureId: fixture.fixture_id,
      gameweek: fixture.event,
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
      homeShortName: fixture.home_short,
      awayShortName: fixture.away_short,
      kickoffTime: fixture.kickoff_time ? String(fixture.kickoff_time) : null,
      finished: fixture.finished,
      homeScore: fixture.team_h_score === null ? null : Number(fixture.team_h_score),
      awayScore: fixture.team_a_score === null ? null : Number(fixture.team_a_score),
      modelPick: modelPick
        ? { market: modelPick.market, selection: modelPick.selection, probability: modelPick.probability }
        : null,
      booking: bookingByFixture.get(fixture.fixture_id) ?? null,
    };
  });

  return { rows, summary: summarizeSlate(rows), availableGameweeks };
}
