"use client";

import { Save, Sparkles, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Position, RankedPlayer, RankingParams } from "@/lib/fpl-types";
import { scoreTone } from "@/lib/score-style";
import type { TeamAnalysis } from "@/lib/team-analysis";

const storageKey = "fpl-team-id";
const positions: Position[] = ["GKP", "DEF", "MID", "FWD"];

type TeamResponse = TeamAnalysis & {
  team: {
    id: number;
    name: string;
    manager: string;
  };
  season: string;
  currentGameweek: number;
  includesLiveGameweek: boolean;
};

function queryFor(params: RankingParams, showLiveData: boolean) {
  const query = new URLSearchParams({
    formWindow: String(params.formWindow),
    fixtureHorizon: String(params.fixtureHorizon),
    individual: String(params.weights.individual),
    team: String(params.weights.team),
    fixtures: String(params.weights.fixtures),
    venue: String(params.weights.venue),
    includeLive: String(showLiveData),
  });
  return query.toString();
}

function Suggestion({ player }: { player: RankedPlayer }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{player.name}</p>
        <p className="text-xs text-muted-foreground">{player.teamShortName} · £{player.cost.toFixed(1)}m</p>
      </div>
      <span className="score-badge" data-tone={scoreTone(player.score)}>{player.score.toFixed(1)}</span>
    </li>
  );
}

export function TeamAnalysisPanel({
  params,
  showLiveData,
  onShowLiveDataChange,
}: {
  params: RankingParams;
  showLiveData: boolean;
  onShowLiveDataChange: (enabled: boolean) => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [analysis, setAnalysis] = useState<TeamResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyseTeam = useCallback(async (nextTeamId: string) => {
    if (!/^[1-9]\d{0,8}$/.test(nextTeamId)) {
      setError("Enter a valid positive FPL team ID.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/team/${nextTeamId}?${queryFor(params, showLiveData)}`);
      const payload = (await response.json()) as TeamResponse | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Unable to analyse this FPL team.");
      }
      setAnalysis(payload);
    } catch (reason) {
      setAnalysis(null);
      setError(reason instanceof Error ? reason.message : "Unable to analyse this FPL team.");
    } finally {
      setIsLoading(false);
    }
  }, [params, showLiveData]);

  useEffect(() => {
    const savedTeamId = window.localStorage.getItem(storageKey);
    if (!savedTeamId) return;
    const timeout = window.setTimeout(() => {
      setTeamId(savedTeamId);
      void analyseTeam(savedTeamId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [analyseTeam]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTeamId = teamId.trim();
    if (!/^[1-9]\d{0,8}$/.test(nextTeamId)) {
      setError("Enter a valid positive FPL team ID.");
      return;
    }
    window.localStorage.setItem(storageKey, nextTeamId);
    void analyseTeam(nextTeamId);
  }

  return (
    <section className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UsersRound size={17} className="text-muted-foreground" /> My FPL team</CardTitle>
          <p className="text-sm text-muted-foreground">Save your public FPL entry ID in this browser and compare its squad with the current formula.</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <label className="grid flex-1 gap-1.5 text-sm font-medium">
              <span>FPL team ID</span>
              <input
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                placeholder="e.g. 123456"
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <Save size={16} /> {isLoading ? "Analysing…" : "Save & analyse"}
            </button>
          </form>
          <label className="mt-4 flex cursor-pointer items-start gap-3 border-t pt-4 text-sm">
            <input
              type="checkbox"
              checked={showLiveData}
              disabled={isLoading}
              onChange={(event) => onShowLiveDataChange(event.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block font-medium">Show live GW data</span>
              <span className="block text-xs text-muted-foreground">Updates this team&apos;s score and recommendations with available in-progress GW data.</span>
            </span>
          </label>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {analysis && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Team</p>
                <p className="mt-1 truncate text-lg font-semibold">{analysis.team.name}</p>
                <p className="text-sm text-muted-foreground">{analysis.team.manager}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Squad average</p>
                <p className="mt-1 text-2xl font-semibold">{analysis.averageScore?.toFixed(1) ?? "—"}</p>
                <p className="text-sm text-muted-foreground">Formula score · 0–100</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Data context</p>
                <p className="mt-1 text-lg font-semibold">
                  {analysis.season} · {analysis.includesLiveGameweek ? `live through GW${analysis.currentGameweek}` : `after GW${analysis.currentGameweek}`}
                </p>
                <p className="text-sm text-muted-foreground">{analysis.members.length} scored squad members</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Squad member scores</CardTitle>
              <p className="text-sm text-muted-foreground">Scores use the formula controls selected in Rankings.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="pb-3 font-medium">Player</th><th className="pb-3 font-medium">Position</th><th className="pb-3 font-medium">Club</th><th className="pb-3 text-right font-medium">Score</th><th className="pb-3 text-right font-medium">Rank</th></tr>
                </thead>
                <tbody>
                  {analysis.members.map((player) => (
                    <tr key={player.playerId} className="border-b last:border-0">
                      <td className="py-3 font-medium">
                        {player.name} {player.isCaptain && <span className="ml-1 text-xs text-foreground">(C)</span>}{player.isViceCaptain && <span className="ml-1 text-xs text-muted-foreground">(VC)</span>}
                      </td>
                      <td className="py-3 text-muted-foreground">{player.position}</td>
                      <td className="py-3 text-muted-foreground">{player.teamShortName}</td>
                      <td className="py-3 text-right"><span className="score-badge" data-tone={scoreTone(player.score)}>{player.score.toFixed(1)}</span></td>
                      <td className="py-3 text-right text-muted-foreground">#{player.rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex items-center gap-2"><Sparkles size={17} className="text-muted-foreground" /><h2 className="text-base font-semibold">Position recommendations</h2></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {positions.map((position) => (
                <Card key={position}>
                  <CardHeader><CardTitle>{position}</CardTitle></CardHeader>
                  <CardContent>
                    <ol className="divide-y">
                      {analysis.suggestions[position].map((player) => <Suggestion key={player.playerId} player={player} />)}
                      {!analysis.suggestions[position].length && <li className="py-2 text-sm text-muted-foreground">No eligible suggestions.</li>}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
