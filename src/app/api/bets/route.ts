import { NextRequest, NextResponse } from "next/server";
import { addBet, deleteBet, listBets, type BetInput } from "@/lib/bets";
import {
  DEFAULT_FORECAST_PARAMS,
  getFixtureForecast,
  type ForecastParams,
} from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

function numberParam(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function forecastParamsFromBody(body: Record<string, unknown>): ForecastParams {
  return {
    lookbackGameweeks: numberParam(body.lookback, DEFAULT_FORECAST_PARAMS.lookbackGameweeks),
    homeAdvantage: numberParam(body.homeAdvantage, DEFAULT_FORECAST_PARAMS.homeAdvantage),
    correlation: numberParam(body.correlation, DEFAULT_FORECAST_PARAMS.correlation),
    simulations: Math.round(numberParam(body.simulations, DEFAULT_FORECAST_PARAMS.simulations)),
    fplStrengthBlend: numberParam(body.fplBlend, DEFAULT_FORECAST_PARAMS.fplStrengthBlend),
  };
}

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
      lookback?: number;
      homeAdvantage?: number;
      correlation?: number;
      simulations?: number;
      fplBlend?: number;
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

    const forecastParams = forecastParamsFromBody(body as Record<string, unknown>);
    const forecastPayload = await getFixtureForecast(body.fixtureId, forecastParams);
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
