import { NextRequest, NextResponse } from "next/server";
import { getPlayerHighlight } from "@/lib/player-highlights";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const playerId = Number((await params).playerId);
  if (!Number.isSafeInteger(playerId) || playerId < 1) {
    return NextResponse.json({ error: "Player ID must be a positive integer." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getPlayerHighlight(playerId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare this player highlight." },
      { status: 500 },
    );
  }
}
