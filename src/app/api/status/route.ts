import { NextResponse } from "next/server";
import { query } from "@/lib/db";

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
    return NextResponse.json({ latest: latest ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read sync status." },
      { status: 500 },
    );
  }
}
