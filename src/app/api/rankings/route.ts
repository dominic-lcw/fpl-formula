import { NextRequest, NextResponse } from "next/server";
import { getRankingData } from "@/lib/rankings";
import { DEFAULT_PARAMS, sanitiseParams } from "@/lib/scoring";
import type { Position } from "@/lib/fpl-types";

export const dynamic = "force-dynamic";

function numberParam(value: string | null) {
  return value === null ? undefined : Number(value);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const params = sanitiseParams({
    formWindow: numberParam(searchParams.get("formWindow")),
    fixtureHorizon: numberParam(searchParams.get("fixtureHorizon")),
    minMinutes: numberParam(searchParams.get("minMinutes")),
    weights: {
      individual: numberParam(searchParams.get("individual")) ?? DEFAULT_PARAMS.weights.individual,
      team: numberParam(searchParams.get("teamWeight")) ?? numberParam(searchParams.get("team")) ?? DEFAULT_PARAMS.weights.team,
      fixtures: numberParam(searchParams.get("fixtures")) ?? DEFAULT_PARAMS.weights.fixtures,
      venue: numberParam(searchParams.get("venue")) ?? 0,
    },
  });
  const position = searchParams.get("position") as Position | "ALL" | null;
  const teamFilter = searchParams.get("club") ?? searchParams.get("teamFilter");
  const liveGameweek = numberParam(searchParams.get("liveGameweek"));

  try {
    return NextResponse.json(
      await getRankingData(params, {
        liveGameweek,
        position: position && position !== "ALL" ? position : undefined,
        team: teamFilter && teamFilter !== "ALL" ? teamFilter : undefined,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to query FPL data." },
      { status: 500 },
    );
  }
}
