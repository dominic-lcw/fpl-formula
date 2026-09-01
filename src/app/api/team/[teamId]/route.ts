import { NextRequest, NextResponse } from "next/server";
import type { RankingParams } from "@/lib/fpl-types";
import { getRankingData } from "@/lib/rankings";
import { DEFAULT_PARAMS, sanitiseParams } from "@/lib/scoring";
import { buildTeamAnalysis, type FplPick } from "@/lib/team-analysis";

export const dynamic = "force-dynamic";

type FplEntry = {
  name: string;
  player_first_name: string;
  player_last_name: string;
};

type FplPicksResponse = {
  picks: FplPick[];
};

function numberParam(value: string | null) {
  return value === null ? undefined : Number(value);
}

function paramsFromRequest(request: NextRequest): RankingParams {
  const { searchParams } = request.nextUrl;
  return sanitiseParams({
    formWindow: numberParam(searchParams.get("formWindow")),
    fixtureHorizon: numberParam(searchParams.get("fixtureHorizon")),
    minMinutes: 0,
    weights: {
      individual: numberParam(searchParams.get("individual")) ?? DEFAULT_PARAMS.weights.individual,
      team: numberParam(searchParams.get("team")) ?? DEFAULT_PARAMS.weights.team,
      fixtures: numberParam(searchParams.get("fixtures")) ?? DEFAULT_PARAMS.weights.fixtures,
      venue: numberParam(searchParams.get("venue")) ?? DEFAULT_PARAMS.weights.venue,
    },
  });
}

async function getFplJson<T>(path: string): Promise<T> {
  const response = await fetch(`https://fantasy.premierleague.com/api/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "No FPL team was found for that ID." : "FPL is unavailable right now.");
  }
  return response.json() as Promise<T>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/team/[teamId]">,
) {
  const { teamId } = await context.params;
  if (!/^[1-9]\d{0,8}$/.test(teamId)) {
    return NextResponse.json({ error: "Enter a valid positive FPL team ID." }, { status: 400 });
  }

  try {
    const rankingData = await getRankingData(paramsFromRequest(request));
    if (!rankingData.season || !rankingData.currentGameweek) {
      return NextResponse.json(
        { error: "Rankings are unavailable until FPL data has been hydrated." },
        { status: 503 },
      );
    }

    const [entry, picks] = await Promise.all([
      getFplJson<FplEntry>(`entry/${teamId}/`),
      getFplJson<FplPicksResponse>(`entry/${teamId}/event/${rankingData.currentGameweek}/picks/`),
    ]);

    return NextResponse.json({
      team: {
        id: Number(teamId),
        name: entry.name,
        manager: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
      },
      season: rankingData.season,
      currentGameweek: rankingData.currentGameweek,
      ...buildTeamAnalysis(rankingData, picks.picks),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to analyse this FPL team." },
      { status: 502 },
    );
  }
}
