import { NextRequest, NextResponse } from "next/server";
import {
  getFixtureForecast,
  getForecastData,
  sanitiseForecastParams,
} from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

function numberParam(value: string | null, fallback: number) {
  const parsed = value === null ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildParams(searchParams: URLSearchParams) {
  return sanitiseForecastParams({
    lookbackGameweeks: numberParam(searchParams.get("lookback"), NaN),
    homeAdvantage: numberParam(searchParams.get("homeAdvantage"), NaN),
    correlation: numberParam(searchParams.get("correlation"), NaN),
    simulations: numberParam(searchParams.get("simulations"), NaN),
    fplStrengthBlend: numberParam(searchParams.get("fplBlend"), NaN),
    formulaStrengthBlend: numberParam(searchParams.get("formulaBlend"), NaN),
    attackGoalsCap: numberParam(searchParams.get("attackGoalsCap"), NaN),
  });
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
