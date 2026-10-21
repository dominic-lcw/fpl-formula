import { NextResponse } from "next/server";
import { syncCurrentSeasonFromFpl } from "@/lib/fpl-hydrate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncCurrentSeasonFromFpl();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync current-season FPL data." },
      { status: 500 },
    );
  }
}
