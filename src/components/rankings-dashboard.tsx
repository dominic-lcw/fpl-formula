"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, RefreshCw, Settings2, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Position, RankedPlayer, RankingParams, RankingResponse } from "@/lib/fpl-types";
import { DEFAULT_PARAMS } from "@/lib/scoring";

const positionOptions: Array<Position | "ALL"> = ["ALL", "GKP", "DEF", "MID", "FWD"];

function fixtureTone(difficulty: number) {
  if (difficulty <= 2) return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  if (difficulty >= 4) return "border-rose-300/20 bg-rose-300/10 text-rose-100";
  return "border-amber-300/20 bg-amber-300/10 text-amber-100";
}

function ParameterSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      <span className="flex justify-between"><span>{label}</span><strong className="text-slate-100">{value}</strong></span>
      <input
        className="accent-cyan-300"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PlayerDetail({ player }: { player: RankedPlayer }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10">
        Explain
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-xl -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-50 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold">{player.name}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-400">
                {player.team} · {player.position} · £{player.cost.toFixed(1)}m
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18} /></Dialog.Close>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {Object.entries(player.breakdown).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-slate-800 p-3">
                <p className="text-xs capitalize text-slate-400">{key}</p>
                <p className="mt-1 text-2xl font-semibold">{value.toFixed(1)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium">Next fixtures</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {player.fixtures.map((fixture, index) => (
                <Badge key={`${fixture.event}-${index}`} className={fixtureTone(fixture.difficulty)}>
                  GW{fixture.event ?? "?"} {fixture.opponent} ({fixture.wasHome ? "H" : "A"}) · {fixture.difficulty}
                </Badge>
              ))}
              {!player.fixtures.length && <span className="text-sm text-slate-400">No scheduled fixtures in this horizon.</span>}
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-300">
            This score combines rolling individual FPL form, club form, FPL fixture difficulty, and home/away context. Component scores are normalized against the current player pool.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RankingsDashboard() {
  const [params, setParams] = useState<RankingParams>(DEFAULT_PARAMS);
  const [data, setData] = useState<RankingResponse | null>(null);
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [team, setTeam] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRankings = useCallback(async (nextParams: RankingParams) => {
    setIsLoading(true);
    setError(null);
    const search = new URLSearchParams({
      formWindow: String(nextParams.formWindow),
      fixtureHorizon: String(nextParams.fixtureHorizon),
      minMinutes: String(nextParams.minMinutes),
      individual: String(nextParams.weights.individual),
      team: String(nextParams.weights.team),
      fixtures: String(nextParams.weights.fixtures),
      venue: String(nextParams.weights.venue),
    });
    try {
      const response = await fetch(`/api/rankings?${search}`);
      const payload = (await response.json()) as RankingResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load rankings.");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load rankings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let savedParams = DEFAULT_PARAMS;
    const saved = window.localStorage.getItem("fpl-ranking-preset");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as RankingParams;
        savedParams = parsed;
        window.setTimeout(() => setParams(parsed), 0);
      } catch {
        window.localStorage.removeItem("fpl-ranking-preset");
      }
    }
    void loadRankings(savedParams);
  }, [loadRankings]);

  const rankings = useMemo(
    () =>
      (data?.rankings ?? []).filter(
        (player) => (position === "ALL" || player.position === position) && (team === "ALL" || player.team === team),
      ),
    [data, position, team],
  );

  function updateWeight(key: keyof RankingParams["weights"], value: number) {
    setParams((current) => ({ ...current, weights: { ...current.weights, [key]: value } }));
  }

  function applyFormula() {
    window.localStorage.setItem("fpl-ranking-preset", JSON.stringify(params));
    void loadRankings(params);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-8">
      <header className="flex flex-col justify-between gap-5 border-b border-white/10 pb-8 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-cyan-200">
            <span className="h-2 w-2 rounded-full bg-cyan-300" /> FPL Formula Lab
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Player rankings, explained.</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            FPL-only scores built from individual form, team form, fixture difficulty, and venue.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm">
          <p className="text-slate-400">Dataset</p>
          <p className="mt-1 font-medium text-slate-100">
            {data?.season ? `${data.season} · after GW${data.currentGameweek ?? "?"}` : "Awaiting first hydration"}
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-5 xl:grid-cols-[285px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><SlidersHorizontal size={16} className="text-cyan-200" /> Formula controls</CardTitle>
            <p className="text-sm text-slate-400">Saved automatically on Apply.</p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ParameterSlider label="Form window (GWs)" value={params.formWindow} min={1} max={10} onChange={(value) => setParams({ ...params, formWindow: value })} />
            <ParameterSlider label="Fixture horizon (GWs)" value={params.fixtureHorizon} min={1} max={8} onChange={(value) => setParams({ ...params, fixtureHorizon: value })} />
            <ParameterSlider label="Minimum minutes" value={params.minMinutes} min={0} max={900} onChange={(value) => setParams({ ...params, minMinutes: value })} />
            <div className="grid gap-3 border-t border-white/10 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Score weights</p>
              <ParameterSlider label="Individual" value={params.weights.individual} min={0} max={100} onChange={(value) => updateWeight("individual", value)} />
              <ParameterSlider label="Team" value={params.weights.team} min={0} max={100} onChange={(value) => updateWeight("team", value)} />
              <ParameterSlider label="Fixtures" value={params.weights.fixtures} min={0} max={100} onChange={(value) => updateWeight("fixtures", value)} />
              <ParameterSlider label="Home / away" value={params.weights.venue} min={0} max={100} onChange={(value) => updateWeight("venue", value)} />
            </div>
            <button onClick={applyFormula} className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
              Apply formula
            </button>
          </CardContent>
        </Card>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <label className="relative">
                <span className="sr-only">Position</span>
                <select value={position} onChange={(event) => setPosition(event.target.value as Position | "ALL")} className="appearance-none rounded-lg border border-white/10 bg-slate-900 px-3 py-2 pr-8 text-sm text-slate-200 outline-none focus:border-cyan-300">
                  {positionOptions.map((option) => <option key={option} value={option}>{option === "ALL" ? "All positions" : option}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-slate-500" size={15} />
              </label>
              <label className="relative">
                <span className="sr-only">Club</span>
                <select value={team} onChange={(event) => setTeam(event.target.value)} className="appearance-none rounded-lg border border-white/10 bg-slate-900 px-3 py-2 pr-8 text-sm text-slate-200 outline-none focus:border-cyan-300">
                  <option value="ALL">All clubs</option>
                  {data?.availableTeams.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-slate-500" size={15} />
              </label>
            </div>
            <button onClick={() => void loadRankings(params)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Expected ranking</CardTitle><p className="text-sm text-slate-400">{rankings.length} eligible players</p></div>
              <Settings2 size={18} className="text-slate-500" />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? <p className="py-12 text-center text-slate-400">Calculating the player pool…</p> : error ? <p className="py-12 text-center text-rose-200">{error}</p> : !data?.season ? (
                <div className="py-12 text-center"><p className="font-medium text-slate-100">No FPL data has been hydrated yet.</p><p className="mt-2 text-sm text-slate-400">Run <code className="rounded bg-slate-800 px-1.5 py-0.5">pnpm hydrate</code> to download the archive and current season.</p></div>
              ) : (
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                    <tr><th className="pb-3 pr-3">Rank</th><th className="pb-3">Player</th><th className="pb-3">Form</th><th className="pb-3">xG / xA</th><th className="pb-3">Defcon</th><th className="pb-3">Next</th><th className="pb-3">Score</th><th className="pb-3" /></tr>
                  </thead>
                  <tbody>
                    {rankings.map((player) => (
                      <tr key={player.playerId} className="border-b border-white/5 last:border-0">
                        <td className="py-4 pr-3 font-mono text-slate-500">{player.rank}</td>
                        <td className="py-4"><div className="font-medium text-slate-100">{player.name}</div><div className="mt-0.5 text-xs text-slate-500">{player.teamShortName} · {player.position} · £{player.cost.toFixed(1)}m</div></td>
                        <td className="py-4 text-slate-300">{player.formPoints.toFixed(0)} pts <span className="text-slate-500">/ {player.minutes.toFixed(0)}m</span></td>
                        <td className="py-4 text-slate-300">{player.xg.toFixed(2)} <span className="text-slate-500">/</span> {player.xa.toFixed(2)}</td>
                        <td className="py-4 text-slate-300">{player.defcon.toFixed(0)}</td>
                        <td className="py-4"><div className="flex gap-1">{player.fixtures.slice(0, 3).map((fixture, index) => <Badge key={`${fixture.event}-${index}`} className={fixtureTone(fixture.difficulty)}>{fixture.opponent.slice(0, 3).toUpperCase()} {fixture.wasHome ? "H" : "A"}</Badge>)}</div></td>
                        <td className="py-4"><span className="font-mono text-lg font-semibold text-cyan-200">{player.score.toFixed(1)}</span></td>
                        <td className="py-4 text-right"><PlayerDetail player={player} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
