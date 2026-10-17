import { NextRequest, NextResponse } from "next/server";
import {
  forecastParamsFromSearchParams,
  getFixtureForecast,
  getForecastData,
} from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

function buildParams(searchParams: URLSearchParams) {
  return forecastParamsFromSearchParams(searchParams);
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
