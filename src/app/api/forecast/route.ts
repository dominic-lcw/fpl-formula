import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FORECAST_PARAMS, getFixtureForecast, getForecastData } from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

const forecastCacheHeaders = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const fixtureId = searchParams.get("fixtureId");

  try {
    if (fixtureId) {
      const parsedFixtureId = Number(fixtureId);
      if (!Number.isFinite(parsedFixtureId)) {
        return NextResponse.json({ error: "Invalid fixtureId." }, { status: 400 });
      }
      return NextResponse.json(
        await getFixtureForecast(parsedFixtureId, DEFAULT_FORECAST_PARAMS),
        { headers: forecastCacheHeaders },
      );
    }
    return NextResponse.json(await getForecastData(), { headers: forecastCacheHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build match forecast." },
      { status: 500 },
    );
  }
}
