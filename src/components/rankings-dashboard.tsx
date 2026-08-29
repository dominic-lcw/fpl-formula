"use client";

import { ChevronDown, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MosaicRankingsTable } from "@/components/mosaic-rankings-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Position, RankingParams, RankingResponse } from "@/lib/fpl-types";
import { DEFAULT_PARAMS } from "@/lib/scoring";

const positionOptions: Array<Position | "ALL"> = ["ALL", "GKP", "DEF", "MID", "FWD"];

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

export function RankingsDashboard() {
  const [params, setParams] = useState<RankingParams>(DEFAULT_PARAMS);
  const [data, setData] = useState<RankingResponse | null>(null);
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [team, setTeam] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const latestRequest = useRef(0);

  const loadRankings = useCallback(async (nextParams: RankingParams) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++latestRequest.current;
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
      const response = await fetch(`/api/rankings?${search}`, { signal: controller.signal });
      const payload = (await response.json()) as RankingResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load rankings.");
      if (requestId === latestRequest.current) setData(payload);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (requestId === latestRequest.current) {
        setError(reason instanceof Error ? reason.message : "Unable to load rankings.");
      }
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let savedParams = DEFAULT_PARAMS;
    const saved = window.localStorage.getItem("fpl-ranking-preset");
    if (saved) {
      try {
        savedParams = JSON.parse(saved) as RankingParams;
      } catch {
        window.localStorage.removeItem("fpl-ranking-preset");
      }
    }
    const timeout = window.setTimeout(() => {
      setParams(savedParams);
      void loadRankings(savedParams);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadRankings]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const rankings = useMemo(
    () =>
      (data?.rankings ?? []).filter(
        (player) => (position === "ALL" || player.position === position) && (team === "ALL" || player.team === team),
      ),
    [data, position, team],
  );

  function updateParams(nextParams: RankingParams) {
    setParams(nextParams);
    window.localStorage.setItem("fpl-ranking-preset", JSON.stringify(nextParams));
    void loadRankings(nextParams);
  }

  function updateWeight(key: keyof RankingParams["weights"], value: number) {
    updateParams({ ...params, weights: { ...params.weights, [key]: value } });
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
            <p className="text-sm text-slate-400">Rankings update and settings save as you adjust each control.</p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ParameterSlider label="Form window (GWs)" value={params.formWindow} min={1} max={10} onChange={(value) => updateParams({ ...params, formWindow: value })} />
            <ParameterSlider label="Fixture horizon (GWs)" value={params.fixtureHorizon} min={1} max={8} onChange={(value) => updateParams({ ...params, fixtureHorizon: value })} />
            <ParameterSlider label="Minimum minutes" value={params.minMinutes} min={0} max={900} onChange={(value) => updateParams({ ...params, minMinutes: value })} />
            <div className="grid gap-3 border-t border-white/10 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Score weights</p>
              <ParameterSlider label="Individual" value={params.weights.individual} min={0} max={100} onChange={(value) => updateWeight("individual", value)} />
              <ParameterSlider label="Team" value={params.weights.team} min={0} max={100} onChange={(value) => updateWeight("team", value)} />
              <ParameterSlider label="Fixtures" value={params.weights.fixtures} min={0} max={100} onChange={(value) => updateWeight("fixtures", value)} />
              <ParameterSlider label="Home / away" value={params.weights.venue} min={0} max={100} onChange={(value) => updateWeight("venue", value)} />
            </div>
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
            <CardContent>
              {isLoading ? <p className="py-12 text-center text-slate-400">Calculating the player pool…</p> : error ? <p className="py-12 text-center text-rose-200">{error}</p> : !data?.season ? (
                <div className="py-12 text-center"><p className="font-medium text-slate-100">No FPL data has been hydrated yet.</p><p className="mt-2 text-sm text-slate-400">Run <code className="rounded bg-slate-800 px-1.5 py-0.5">pnpm hydrate</code> to download the archive and current season.</p></div>
              ) : (
                <MosaicRankingsTable rankings={rankings} />
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
