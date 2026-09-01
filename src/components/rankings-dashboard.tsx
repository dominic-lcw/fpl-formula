"use client";

import { ChevronDown, GitBranch, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MosaicRankingsTable } from "@/components/mosaic-rankings-table";
import { TeamAnalysisPanel } from "@/components/team-analysis";
import { ScoreFormula } from "@/components/score-formula";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { liveGameweekForRankings, type LiveGameweekStatus } from "@/lib/fpl-gameweeks";
import type { Position, RankingParams } from "@/lib/fpl-types";
import { calculateMosaicRankings, type MosaicRankingData } from "@/lib/mosaic-rankings";
import { DEFAULT_PARAMS, FORMULA_PRESETS, sanitiseParams } from "@/lib/scoring";

const positionOptions: Array<Position | "ALL"> = ["ALL", "GKP", "DEF", "MID", "FWD"];

type StatusResponse = {
  liveGameweek: LiveGameweekStatus | null;
};

function liveGameweekLabel(liveGameweek: LiveGameweekStatus) {
  if (liveGameweek.currentGameweekStatus === "in_progress") {
    return `Live FPL: GW${liveGameweek.currentGameweek} in progress`;
  }
  if (liveGameweek.currentGameweekStatus === "upcoming") {
    return `Live FPL: GW${liveGameweek.currentGameweek} next`;
  }
  return `Live FPL: GW${liveGameweek.currentGameweek} complete`;
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

export function RankingsDashboard() {
  const [params, setParams] = useState<RankingParams>(DEFAULT_PARAMS);
  const [data, setData] = useState<MosaicRankingData | null>(null);
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [team, setTeam] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"rankings" | "team">("rankings");
  const [tableVersion, setTableVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveGameweek, setLiveGameweek] = useState<LiveGameweekStatus | null>(null);
  const [showLiveData, setShowLiveData] = useState(false);
  const latestRequest = useRef(0);

  const loadLiveGameweek = useCallback(async (): Promise<LiveGameweekStatus | null> => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) return null;
      const payload = await response.json() as StatusResponse;
      setLiveGameweek(payload.liveGameweek);
      return payload.liveGameweek;
    } catch {
      setLiveGameweek(null);
      return null;
    }
  }, []);

  const loadRankings = useCallback(async (
    nextParams: RankingParams,
    nextPosition: Position | "ALL",
    nextTeam: string,
    options: {
      refreshDataset?: boolean;
      liveGameweek?: number | null;
    } = {},
  ) => {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const payload = await calculateMosaicRankings(nextParams, nextPosition, nextTeam, options);
      if (requestId === latestRequest.current) {
        setData(payload);
        setTableVersion((version) => version + 1);
      }
    } catch (reason) {
      if (requestId === latestRequest.current) {
        setError(reason instanceof Error ? reason.message : "Unable to calculate rankings locally.");
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
        savedParams = sanitiseParams(JSON.parse(saved) as RankingParams);
      } catch {
        window.localStorage.removeItem("fpl-ranking-preset");
      }
    }
    const timeout = window.setTimeout(() => {
      setParams(savedParams);
      void loadRankings(savedParams, "ALL", "ALL");
      void loadLiveGameweek();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLiveGameweek, loadRankings]);

  function updateParams(nextParams: RankingParams) {
    setParams(nextParams);
    window.localStorage.setItem("fpl-ranking-preset", JSON.stringify(nextParams));
    void loadRankings(nextParams, position, team, {
      liveGameweek: showLiveData ? liveGameweekForRankings(liveGameweek) : null,
    });
  }

  function updateWeight(key: keyof RankingParams["weights"], value: number) {
    updateParams({ ...params, weights: { ...params.weights, [key]: value } });
  }

  function applyPreset(preset: (typeof FORMULA_PRESETS)[number]) {
    updateParams({
      ...params,
      formWindow: preset.formWindow,
      fixtureHorizon: preset.fixtureHorizon,
      weights: { ...preset.weights },
    });
  }

  function updateLiveData(enabled: boolean) {
    setShowLiveData(enabled);
    if (!enabled) {
      void loadRankings(params, position, team);
      return;
    }

    void loadLiveGameweek().then((nextLiveGameweek) => {
      void loadRankings(params, position, team, {
        liveGameweek: liveGameweekForRankings(nextLiveGameweek),
      });
    });
  }

  function refreshRankings() {
    void loadLiveGameweek().then((nextLiveGameweek) => {
      void loadRankings(params, position, team, {
        refreshDataset: true,
        liveGameweek: showLiveData ? liveGameweekForRankings(nextLiveGameweek) : null,
      });
    });
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
            FPL-only scores built from individual form, team form, and fixtures with home advantage included.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm">
            <p className="text-slate-400">Dataset</p>
            <p className="mt-1 font-medium text-slate-100">
              {data?.season
                ? `${data.season} · ${data.includesLiveGameweek ? `live through GW${data.currentGameweek ?? "?"}` : `after GW${data.currentGameweek ?? "?"}`}`
                : "Awaiting first hydration"}
            </p>
            {liveGameweek ? <p aria-live="polite" className="mt-1 text-xs text-cyan-200">{liveGameweekLabel(liveGameweek)}</p> : null}
          </div>
          <a
            href="https://github.com/dominic-lcw/fpl-formula"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            <GitBranch size={16} />
            GitHub
          </a>
        </div>
      </header>

      <div className="mt-6 flex gap-2 border-b border-white/10" role="tablist" aria-label="Dashboard views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "rankings"}
          onClick={() => setActiveTab("rankings")}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition ${activeTab === "rankings" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          Rankings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "team"}
          onClick={() => setActiveTab("team")}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition ${activeTab === "team" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          My team
        </button>
      </div>

      {activeTab === "team" ? <div className="mt-6"><TeamAnalysisPanel params={params} showLiveData={showLiveData} onShowLiveDataChange={updateLiveData} /></div> : <section className="mt-6 grid gap-5 xl:grid-cols-[285px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><SlidersHorizontal size={16} className="text-cyan-200" /> Formula controls</CardTitle>
            <p className="text-sm text-slate-400">Rankings update and settings save as you adjust each control.</p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Formula presets</p>
              <div className="grid gap-2">
                {FORMULA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="rounded-lg border border-white/10 bg-slate-950/20 px-3 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/5"
                  >
                    <span className="block text-sm font-medium text-slate-100">{preset.name}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-400">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <ParameterSlider label="Form window (GWs)" value={params.formWindow} min={1} max={10} onChange={(value) => updateParams({ ...params, formWindow: value })} />
            <ParameterSlider label="Fixture horizon (GWs)" value={params.fixtureHorizon} min={1} max={8} onChange={(value) => updateParams({ ...params, fixtureHorizon: value })} />
            <ParameterSlider label="Minimum minutes" value={params.minMinutes} min={0} max={900} onChange={(value) => updateParams({ ...params, minMinutes: value })} />
            <div className="grid gap-3 border-t border-white/10 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Score weights</p>
              <ParameterSlider label="Individual" value={params.weights.individual} min={0} max={100} onChange={(value) => updateWeight("individual", value)} />
              <ParameterSlider label="Team" value={params.weights.team} min={0} max={100} onChange={(value) => updateWeight("team", value)} />
              <ParameterSlider label="Fixtures" value={params.weights.fixtures} min={0} max={100} onChange={(value) => updateWeight("fixtures", value)} />
            </div>
            <label className="flex cursor-pointer items-start gap-3 border-t border-white/10 pt-4 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={showLiveData}
                disabled={isLoading}
                onChange={(event) => updateLiveData(event.target.checked)}
                className="mt-0.5 accent-cyan-300"
              />
              <span>
                <span className="block font-medium text-slate-100">Show live GW data</span>
                <span className="block text-xs text-slate-400">Includes available partial player stats from the current in-progress gameweek.</span>
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <label className="relative">
                <span className="sr-only">Position</span>
                <select value={position} onChange={(event) => {
                  const nextPosition = event.target.value as Position | "ALL";
                  setPosition(nextPosition);
                  void loadRankings(params, nextPosition, team, {
                    liveGameweek: showLiveData ? liveGameweekForRankings(liveGameweek) : null,
                  });
                }} className="appearance-none rounded-lg border border-white/10 bg-slate-900 px-3 py-2 pr-8 text-sm text-slate-200 outline-none focus:border-cyan-300">
                  {positionOptions.map((option) => <option key={option} value={option}>{option === "ALL" ? "All positions" : option}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-slate-500" size={15} />
              </label>
              <label className="relative">
                <span className="sr-only">Club</span>
                <select value={team} onChange={(event) => {
                  const nextTeam = event.target.value;
                  setTeam(nextTeam);
                  void loadRankings(params, position, nextTeam, {
                    liveGameweek: showLiveData ? liveGameweekForRankings(liveGameweek) : null,
                  });
                }} className="appearance-none rounded-lg border border-white/10 bg-slate-900 px-3 py-2 pr-8 text-sm text-slate-200 outline-none focus:border-cyan-300">
                  <option value="ALL">All clubs</option>
                  {data?.availableTeams.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-slate-500" size={15} />
              </label>
            </div>
            <button
              type="button"
              onClick={refreshRankings}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          <Card className="mb-4">
            <CardContent>
              <ScoreFormula params={params} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader aria-busy={isLoading} className="flex-row items-center justify-between">
              <div>
                <CardTitle>Expected ranking</CardTitle>
                <p aria-live="polite" className="text-sm text-slate-400">
                  {isLoading && data ? "Updating rankings…" : `${data?.count ?? 0} eligible players`}
                </p>
              </div>
              <Settings2 size={18} className="text-slate-500" />
            </CardHeader>
            <CardContent className={isLoading && data ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {isLoading && !data ? <p className="py-12 text-center text-slate-400">Calculating the player pool…</p> : error && !data ? <p className="py-12 text-center text-rose-200">{error}</p> : !data?.season ? (
                <div className="py-12 text-center"><p className="font-medium text-slate-100">No FPL data has been hydrated yet.</p><p className="mt-2 text-sm text-slate-400">Run <code className="rounded bg-slate-800 px-1.5 py-0.5">pnpm hydrate</code> to download the archive and current season.</p></div>
              ) : data.count ? <MosaicRankingsTable version={tableVersion} /> : <p className="py-12 text-center text-slate-400">No players match these filters.</p>}
            </CardContent>
          </Card>
        </div>
      </section>}
    </main>
  );
}
