import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { summarizeGameweeks, type FplEvent } from "@/lib/fpl-gameweeks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [latest] = await query<{
      season: string;
      status: string;
      records_loaded: number;
      completed_at: Date | string | null;
      details: string | null;
    }>(`SELECT season, status, records_loaded, completed_at, details
        FROM sync_runs ORDER BY started_at DESC LIMIT 1`);

    let liveGameweek = null;
    try {
      const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
        next: { revalidate: 60 },
      });
      if (response.ok) {
        const data = await response.json() as { events?: FplEvent[] };
        liveGameweek = summarizeGameweeks(data.events ?? []);
      }
    } catch {
      // The existing hydrated status remains available if FPL is temporarily unavailable.
    }

    return NextResponse.json(
      { latest: latest ?? null, liveGameweek },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read sync status." },
      { status: 500 },
    );
  }
}
