"use client";

import { Save, Sparkles, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Position, RankedPlayer, RankingParams } from "@/lib/fpl-types";
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
};

function queryFor(params: RankingParams) {
  const query = new URLSearchParams({
    formWindow: String(params.formWindow),
    fixtureHorizon: String(params.fixtureHorizon),
    individual: String(params.weights.individual),
    team: String(params.weights.team),
    fixtures: String(params.weights.fixtures),
    venue: String(params.weights.venue),
  });
  return query.toString();
}

function Suggestion({ player }: { player: RankedPlayer }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-100">{player.name}</p>
        <p className="text-xs text-slate-400">{player.teamShortName} · £{player.cost.toFixed(1)}m</p>
      </div>
      <span className="score-badge border-cyan-300/40 bg-cyan-300/10 text-cyan-100">{player.score.toFixed(1)}</span>
    </li>
  );
}

export function TeamAnalysisPanel({ params }: { params: RankingParams }) {
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
      const response = await fetch(`/api/team/${nextTeamId}?${queryFor(params)}`);
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
  }, [params]);

  useEffect(() => {
    const savedTeamId = window.localStorage.getItem(storageKey);
    if (!savedTeamId) return;
    setTeamId(savedTeamId);
    void analyseTeam(savedTeamId);
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
          <CardTitle className="flex items-center gap-2"><UsersRound size={17} className="text-cyan-200" /> My FPL team</CardTitle>
          <p className="text-sm text-slate-400">Save your public FPL entry ID in this browser and compare its squad with the current formula.</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <label className="grid flex-1 gap-1.5 text-sm text-slate-300">
              <span>FPL team ID</span>
              <input
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                placeholder="e.g. 123456"
                className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
            >
              <Save size={16} /> {isLoading ? "Analysing…" : "Save & analyse"}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}
        </CardContent>
      </Card>

      {analysis && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent>
                <p className="text-sm text-slate-400">Team</p>
                <p className="mt-1 truncate text-lg font-semibold text-slate-50">{analysis.team.name}</p>
                <p className="text-sm text-slate-400">{analysis.team.manager}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-slate-400">Squad average</p>
                <p className="mt-1 text-2xl font-semibold text-cyan-200">{analysis.averageScore?.toFixed(1) ?? "—"}</p>
                <p className="text-sm text-slate-400">Formula score · 0–100</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-slate-400">Data context</p>
                <p className="mt-1 text-lg font-semibold text-slate-50">{analysis.season} · GW{analysis.currentGameweek}</p>
                <p className="text-sm text-slate-400">{analysis.members.length} scored squad members</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Squad member scores</CardTitle>
              <p className="text-sm text-slate-400">Scores use the formula controls selected in Rankings.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                  <tr><th className="pb-3 font-medium">Player</th><th className="pb-3 font-medium">Position</th><th className="pb-3 font-medium">Club</th><th className="pb-3 text-right font-medium">Score</th><th className="pb-3 text-right font-medium">Rank</th></tr>
                </thead>
                <tbody>
                  {analysis.members.map((player) => (
                    <tr key={player.playerId} className="border-b border-white/5 last:border-0">
                      <td className="py-3 font-medium text-slate-100">
                        {player.name} {player.isCaptain && <span className="ml-1 text-xs text-cyan-200">(C)</span>}{player.isViceCaptain && <span className="ml-1 text-xs text-slate-400">(VC)</span>}
                      </td>
                      <td className="py-3 text-slate-300">{player.position}</td>
                      <td className="py-3 text-slate-300">{player.teamShortName}</td>
                      <td className="py-3 text-right"><span className="score-badge border-cyan-300/40 bg-cyan-300/10 text-cyan-100">{player.score.toFixed(1)}</span></td>
                      <td className="py-3 text-right text-slate-300">#{player.rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex items-center gap-2"><Sparkles size={17} className="text-cyan-200" /><h2 className="text-base font-semibold">Position recommendations</h2></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {positions.map((position) => (
                <Card key={position}>
                  <CardHeader><CardTitle>{position}</CardTitle></CardHeader>
                  <CardContent>
                    <ol className="divide-y divide-white/5">
                      {analysis.suggestions[position].map((player) => <Suggestion key={player.playerId} player={player} />)}
                      {!analysis.suggestions[position].length && <li className="py-2 text-sm text-slate-400">No eligible suggestions.</li>}
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
