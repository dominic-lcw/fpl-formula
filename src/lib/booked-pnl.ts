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

export type GameweekBookedPnl = {
  gameweek: number;
  pnl: number;
  runningPnl: number;
  won: number;
  lost: number;
  betCount: number;
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

function hasPnl(record: BookedPnlRecord): record is BookedPnlRecord & { pnl: number } {
  return record.pnl !== null && Number.isFinite(record.pnl);
}

/**
 * One total per gameweek. A gameweek is realized once every booked bet in it
 * has a PnL. The series starts at the first realized gameweek.
 */
export function gameweekBookedPnl(records: BookedPnlRecord[]): GameweekBookedPnl[] {
  const grouped = new Map<number, BookedPnlRecord[]>();
  for (const record of records) {
    if (record.gameweek === null || !Number.isInteger(record.gameweek)) continue;
    const rows = grouped.get(record.gameweek) ?? [];
    rows.push(record);
    grouped.set(record.gameweek, rows);
  }

  const realized = [...grouped.entries()]
    .filter(([, rows]) => rows.length > 0 && rows.every(hasPnl))
    .sort(([left], [right]) => left - right);

  let runningPnl = 0;
  return realized.map(([gameweek, rows]) => {
    const pnl = rows.reduce((total, row) => total + (row.pnl ?? 0), 0);
    runningPnl += pnl;
    return {
      gameweek,
      pnl,
      runningPnl,
      won: rows.filter((row) => row.outcome === "won").length,
      lost: rows.filter((row) => row.outcome === "lost").length,
      betCount: rows.length,
    };
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

  return gameweekBookedPnl(rows.map(mapBookedPnlRow));
}
