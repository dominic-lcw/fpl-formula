"use client";

import { ChevronDown, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { useDashboard } from "@/components/dashboard-provider";
import { MosaicRankingsTable } from "@/components/mosaic-rankings-table";
import { PlayerRankSearch } from "@/components/player-rank-search";
import { PlayerRankTracker } from "@/components/player-rank-tracker";
import { ScoreFormula } from "@/components/score-formula";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Position, RankingParams } from "@/lib/fpl-types";
import { FORMULA_PRESETS } from "@/lib/scoring";

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
    <label className="grid gap-2 text-sm">
      <span className="flex justify-between"><span>{label}</span><strong>{value}</strong></span>
      <input
        className="accent-primary"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function RankingsView() {
  const {
    params,
    updateParams,
    data,
    position,
    setPosition,
    team,
    setTeam,
    tableVersion,
    selectedRank,
    setSelectedRank,
    isLoading,
    error,
    showLiveData,
    updateLiveData,
    refreshRankings,
    pinnedPlayer,
    pinnedSnapshot,
    rankHistory,
    pinPlayer,
    unpinPlayer,
  } = useDashboard();

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

  return (
    <section className="grid gap-5 xl:grid-cols-[285px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SlidersHorizontal size={16} className="text-muted-foreground" /> Formula controls</CardTitle>
          <p className="text-sm text-muted-foreground">Rankings update and settings save as you adjust each control.</p>
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
          <div className="grid gap-3 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Score weights</p>
            <ParameterSlider label="Individual" value={params.weights.individual} min={0} max={100} onChange={(value) => updateWeight("individual", value)} />
            <ParameterSlider label="Team" value={params.weights.team} min={0} max={100} onChange={(value) => updateWeight("team", value)} />
            <ParameterSlider label="Fixtures" value={params.weights.fixtures} min={0} max={100} onChange={(value) => updateWeight("fixtures", value)} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 border-t pt-4 text-sm">
            <input
              type="checkbox"
              checked={showLiveData}
              disabled={isLoading}
              onChange={(event) => updateLiveData(event.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block font-medium">Show live GW data</span>
              <span className="block text-xs text-muted-foreground">Includes available partial player stats from the current in-progress gameweek.</span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <label className="relative">
              <span className="sr-only">Position</span>
              <select value={position} onChange={(event) => setPosition(event.target.value as Position | "ALL")} className="h-9 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {positionOptions.map((option) => <option key={option} value={option}>{option === "ALL" ? "All positions" : option}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted-foreground" size={15} />
            </label>
            <label className="relative">
              <span className="sr-only">Club</span>
              <select value={team} onChange={(event) => setTeam(event.target.value)} className="h-9 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="ALL">All clubs</option>
                {data?.availableTeams.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted-foreground" size={15} />
            </label>
            {data?.season ? (
              <PlayerRankSearch
                key={tableVersion}
                pinnedPlayer={pinnedPlayer}
                onSelectRank={setSelectedRank}
                onPinPlayer={pinPlayer}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={refreshRankings}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        {pinnedPlayer ? (
          <div className="mb-4">
            <PlayerRankTracker
              playerName={pinnedPlayer.name}
              snapshot={pinnedSnapshot}
              history={rankHistory}
              isLoading={isLoading}
              onUnpin={unpinPlayer}
            />
          </div>
        ) : null}

        <Card className="mb-4">
          <CardContent>
            <ScoreFormula params={params} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader aria-busy={isLoading} className="flex-row items-center justify-between">
            <div>
              <CardTitle>Expected ranking</CardTitle>
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {isLoading && data ? "Updating rankings…" : `${data?.count ?? 0} eligible players`}
              </p>
            </div>
            <Settings2 size={18} className="text-muted-foreground" />
          </CardHeader>
          <CardContent className={isLoading && data ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {isLoading && !data ? <p className="py-12 text-center text-muted-foreground">Calculating the player pool…</p> : error && !data ? <p className="py-12 text-center text-destructive">{error}</p> : !data?.season ? (
              <div className="py-12 text-center"><p className="font-medium">No FPL data has been hydrated yet.</p><p className="mt-2 text-sm text-muted-foreground">Run <code className="rounded bg-muted px-1.5 py-0.5">pnpm hydrate</code> to download the archive and current season.</p></div>
            ) : data.count ? <MosaicRankingsTable version={tableVersion} selectedRank={selectedRank} /> : <p className="py-12 text-center text-muted-foreground">No players match these filters.</p>}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
