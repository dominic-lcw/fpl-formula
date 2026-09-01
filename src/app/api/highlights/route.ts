import { NextResponse } from "next/server";
import { getPlayerHighlights } from "@/lib/player-highlights";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPlayerHighlights());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare player highlights." },
      { status: 500 },
    );
  }
}
