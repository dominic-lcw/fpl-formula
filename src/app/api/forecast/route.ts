import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_FORECAST_PARAMS,
  getFixtureForecast,
  getForecastData,
} from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

function numberParam(value: string | null, fallback: number) {
  const parsed = value === null ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildParams(searchParams: URLSearchParams) {
  return {
    lookbackGameweeks: numberParam(searchParams.get("lookback"), DEFAULT_FORECAST_PARAMS.lookbackGameweeks),
    homeAdvantage: numberParam(searchParams.get("homeAdvantage"), DEFAULT_FORECAST_PARAMS.homeAdvantage),
    correlation: numberParam(searchParams.get("correlation"), DEFAULT_FORECAST_PARAMS.correlation),
    simulations: Math.round(numberParam(searchParams.get("simulations"), DEFAULT_FORECAST_PARAMS.simulations)),
    fplStrengthBlend: numberParam(searchParams.get("fplBlend"), DEFAULT_FORECAST_PARAMS.fplStrengthBlend),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const params = buildParams(searchParams);
  const fixtureId = searchParams.get("fixtureId");

  try {
    if (fixtureId) {
      const parsedFixtureId = Number(fixtureId);
      if (!Number.isFinite(parsedFixtureId)) {
        return NextResponse.json({ error: "Invalid fixtureId." }, { status: 400 });
      }
      return NextResponse.json(await getFixtureForecast(parsedFixtureId, params));
    }
    return NextResponse.json(await getForecastData(params));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build match forecast." },
      { status: 500 },
    );
  }
}
