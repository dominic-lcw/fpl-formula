import { settleOpenBookings } from "@/lib/bookings";
import type { BookingMarket, BookingOutcome } from "@/lib/booking-settlement";
import { query } from "@/lib/db";

export type BookedPnlRecord = {
  id: string;
  fixtureId: number;
  gameweek: number | null;
  homeShortName: string;
  awayShortName: string;
  kickoffTime: string | null;
  market: BookingMarket;
  selection: string;
  odds: number;
  stake: number;
  outcome: BookingOutcome | null;
  /** Null until the match is settled. Those rows are not part of the PnL series. */
  pnl: number | null;
  settledAt: string | null;
  bookedAt: string;
};

export type SettledBookedPnl = BookedPnlRecord & {
  pnl: number;
  runningPnl: number;
};

type BookedPnlRow = {
  id: string;
  fixture_id: number;
  gameweek: number | null;
  home_short: string;
  away_short: string;
  kickoff_time: Date | string | null;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  outcome: string | null;
  pnl: number | null;
  settled_at: Date | string | null;
  booked_at: Date | string;
};

function timeValue(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/**
 * Chronological settled PnL. Open bookings (null pnl) are dropped, so the
 * series starts at the first record that actually has a result.
 */
export function settledBookedPnl(records: BookedPnlRecord[]): SettledBookedPnl[] {
  const settled = records.filter((record): record is BookedPnlRecord & { pnl: number } => (
    record.pnl !== null && Number.isFinite(record.pnl)
  ));

  settled.sort((left, right) => {
    const gameweekDelta = (left.gameweek ?? Number.MAX_SAFE_INTEGER) - (right.gameweek ?? Number.MAX_SAFE_INTEGER);
    if (gameweekDelta !== 0) return gameweekDelta;
    const kickoffDelta = timeValue(left.kickoffTime) - timeValue(right.kickoffTime);
    if (kickoffDelta !== 0) return kickoffDelta;
    const settledDelta = timeValue(left.settledAt) - timeValue(right.settledAt);
    if (settledDelta !== 0) return settledDelta;
    return timeValue(left.bookedAt) - timeValue(right.bookedAt);
  });

  let runningPnl = 0;
  return settled.map((record) => {
    runningPnl += record.pnl;
    return { ...record, runningPnl };
  });
}

function mapBookedPnlRow(row: BookedPnlRow): BookedPnlRecord {
  return {
    id: String(row.id),
    fixtureId: Number(row.fixture_id),
    gameweek: row.gameweek === null || row.gameweek === undefined ? null : Number(row.gameweek),
    homeShortName: row.home_short,
    awayShortName: row.away_short,
    kickoffTime: row.kickoff_time ? String(row.kickoff_time) : null,
    market: row.market as BookingMarket,
    selection: row.selection,
    odds: Number(row.odds),
    stake: Number(row.stake),
    outcome: row.outcome === "won" || row.outcome === "lost" ? row.outcome : null,
    pnl: row.pnl === null || row.pnl === undefined ? null : Number(row.pnl),
    settledAt: row.settled_at ? String(row.settled_at) : null,
    bookedAt: String(row.booked_at),
  };
}

export async function listBookedPnlHistory(season: string, options?: { skipSettlement?: boolean }) {
  if (!options?.skipSettlement) {
    await settleOpenBookings();
  }

  const rows = await query<BookedPnlRow>(
    `SELECT
       b.id,
       b.fixture_id,
       f.event AS gameweek,
       COALESCE(th.short_name, b.home_team) AS home_short,
       COALESCE(ta.short_name, b.away_team) AS away_short,
       f.kickoff_time,
       b.market,
       b.selection,
       b.stake,
       b.odds,
       b.outcome,
       b.pnl,
       b.settled_at,
       b.booked_at
     FROM bookings b
     LEFT JOIN fixtures f ON f.season = b.season AND f.fixture_id = b.fixture_id
     LEFT JOIN teams th ON th.season = b.season AND th.team_id = f.team_h
     LEFT JOIN teams ta ON ta.season = b.season AND ta.team_id = f.team_a
     WHERE b.season = ?
     ORDER BY f.event NULLS LAST, f.kickoff_time NULLS LAST, b.booked_at`,
    [season],
  );

  return settledBookedPnl(rows.map(mapBookedPnlRow));
}
