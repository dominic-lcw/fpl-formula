import { NextRequest, NextResponse } from "next/server";
import { forecastParamsFromSearchParams, getFixtureSimulationSetup } from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fixtureId: string }> },
) {
  const { fixtureId } = await context.params;
  const parsedFixtureId = Number(fixtureId);
  if (!Number.isInteger(parsedFixtureId) || parsedFixtureId <= 0) {
    return NextResponse.json({ error: "Invalid fixtureId." }, { status: 400 });
  }

  try {
    const setup = await getFixtureSimulationSetup(
      parsedFixtureId,
      forecastParamsFromSearchParams(request.nextUrl.searchParams),
    );
    if (!setup) {
      return NextResponse.json({ error: "No forecast is available for that match." }, { status: 404 });
    }
    return NextResponse.json(setup);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load this match." },
      { status: 500 },
    );
  }
}
