import { NextRequest, NextResponse } from "next/server";
import { addBet, deleteBet, listBets, type BetInput } from "@/lib/bets";
import { getFixtureForecast } from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const season = request.nextUrl.searchParams.get("season") ?? undefined;
  try {
    return NextResponse.json({ bets: await listBets(season) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load bets." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<BetInput> & {
      fixtureId?: number;
      season?: string;
      homeTeam?: string;
      awayTeam?: string;
      market?: BetInput["market"];
      selection?: string;
      stake?: number;
      odds?: number;
      notes?: string;
    };

    if (
      !body.fixtureId ||
      !body.season ||
      !body.homeTeam ||
      !body.awayTeam ||
      !body.market ||
      !body.selection ||
      !Number.isFinite(body.stake) ||
      !Number.isFinite(body.odds)
    ) {
      return NextResponse.json({ error: "Missing required bet fields." }, { status: 400 });
    }

    const forecastPayload = await getFixtureForecast(body.fixtureId);
    const forecast = forecastPayload.forecast;
    if (!forecast) {
      return NextResponse.json({ error: "Fixture forecast not found." }, { status: 404 });
    }

    const bet = await addBet({
      fixtureId: body.fixtureId,
      season: body.season,
      homeTeam: body.homeTeam,
      awayTeam: body.awayTeam,
      market: body.market,
      selection: body.selection,
      stake: body.stake!,
      odds: body.odds!,
      notes: body.notes,
      forecast,
    });

    return NextResponse.json({ bet });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save bet." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Bet id is required." }, { status: 400 });
  }

  try {
    await deleteBet(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete bet." },
      { status: 500 },
    );
  }
}
