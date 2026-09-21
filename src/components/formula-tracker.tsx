"use client";

import { BookmarkPlus, LoaderCircle, Play, SlidersHorizontal, Sparkles, Trash2, Trophy } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScoreFormula } from "@/components/score-formula";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildBacktestCacheKey,
  calculateFormulaBacktests,
  getMosaicDatasetSyncKey,
  readCachedBacktests,
  TRACKER_PRESET_STRATEGIES,
  type FormulaStrategy,
  type StrategyBacktest,
} from "@/lib/formula-tracking-data";
import { loadMosaicDataset } from "@/lib/mosaic-rankings";
import { FORMULA_PRESETS, sanitiseParams } from "@/lib/scoring";
import type { RankingParams } from "@/lib/fpl-types";

const storageKey = "fpl-saved-formulas-v1";
const formulaStorageEvent = "fpl-formulas-updated";
const emptyStrategies: FormulaStrategy[] = [];
let savedStrategiesCache = { value: null as string | null, strategies: emptyStrategies };

function readSavedStrategies(): FormulaStrategy[] {
  try {
    if (typeof window === "undefined") return emptyStrategies;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === savedStrategiesCache.value) return savedStrategiesCache.strategies;
    if (!saved) {
      savedStrategiesCache = { value: saved, strategies: emptyStrategies };
      return emptyStrategies;
    }
    const parsed = JSON.parse(saved) as Array<Omit<FormulaStrategy, "source">>;
    if (!Array.isArray(parsed)) return emptyStrategies;
    const strategies: FormulaStrategy[] = parsed
      .filter((strategy) => typeof strategy.id === "string" && typeof strategy.name === "string" && strategy.params)
      .map((strategy) => ({
        ...strategy,
        name: strategy.name.slice(0, 48),
        description: strategy.description || "Saved from the Rankings formula controls.",
        params: sanitiseParams(strategy.params),
        source: "saved" as const,
      }));
    savedStrategiesCache = { value: saved, strategies };
    return strategies;
  } catch {
    return emptyStrategies;
  }
}

function subscribeToSavedStrategies(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(formulaStorageEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(formulaStorageEvent, onStoreChange);
  };
}

function persistSavedStrategies(strategies: FormulaStrategy[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(strategies));
  window.dispatchEvent(new Event(formulaStorageEvent));
}

function formatParams(params: RankingParams) {
  return `${params.formWindow} GW form · ${params.fixtureHorizon} GW fixtures · ${params.weights.individual}/${params.weights.team}/${params.weights.fixtures}`;
}

function paramsMatch(left: RankingParams, right: RankingParams) {
  const safeLeft = sanitiseParams(left);
  const safeRight = sanitiseParams(right);
  return safeLeft.formWindow === safeRight.formWindow
    && safeLeft.fixtureHorizon === safeRight.fixtureHorizon
    && safeLeft.weights.individual === safeRight.weights.individual
    && safeLeft.weights.team === safeRight.weights.team
    && safeLeft.weights.fixtures === safeRight.weights.fixtures;
}

export function FormulaTracker({
  currentParams,
  onApplyParams,
}: {
  currentParams: RankingParams;
  onApplyParams: (params: RankingParams) => void;
}) {
  const savedStrategies = useSyncExternalStore(
    subscribeToSavedStrategies,
    readSavedStrategies,
    () => emptyStrategies,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() => TRACKER_PRESET_STRATEGIES.map((strategy) => strategy.id));
  const [formulaName, setFormulaName] = useState("");
  const [reports, setReports] = useState<StrategyBacktest[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDatasetReady, setIsDatasetReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string>(TRACKER_PRESET_STRATEGIES[0]!.id);

  useEffect(() => {
    let cancelled = false;
    void loadMosaicDataset()
      .then(() => {
        if (!cancelled) setIsDatasetReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to prepare the ranking dataset.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyStrategy(strategy: FormulaStrategy) {
    onApplyParams(sanitiseParams(strategy.params));
    setError(null);
  }

  const strategies = useMemo(
    () => [...TRACKER_PRESET_STRATEGIES, ...savedStrategies],
    [savedStrategies],
  );
  const selectedStrategies = strategies.filter((strategy) => selectedIds.includes(strategy.id));
  const reportByStrategy = new Map(reports.map((report) => [report.strategyId, report]));
  const sortedStrategies = [...selectedStrategies].sort(
    (left, right) => (reportByStrategy.get(right.id)?.totalPoints ?? 0) - (reportByStrategy.get(left.id)?.totalPoints ?? 0),
  );
  const topStrategy = sortedStrategies[0] ?? null;
  const highlightedStrategy = strategies.find((strategy) => strategy.id === highlightedId) ?? topStrategy ?? TRACKER_PRESET_STRATEGIES[0]!;
  const winningRounds = useMemo(() => {
    const winners = new Map<string, number>();
    const bestByGameweek = new Map<number, number>();
    for (const report of reports) {
      for (const round of report.rounds) {
        bestByGameweek.set(round.gameweek, Math.max(bestByGameweek.get(round.gameweek) ?? -Infinity, round.points));
      }
    }
    for (const report of reports) {
      winners.set(
        report.strategyId,
        report.rounds.filter((round) => round.points === bestByGameweek.get(round.gameweek)).length,
      );
    }
    return winners;
  }, [reports]);

  useEffect(() => {
    if (!isDatasetReady || selectedStrategies.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const syncKey = await getMosaicDatasetSyncKey();
        const cacheKey = buildBacktestCacheKey(syncKey, selectedStrategies.map((strategy) => strategy.id));
        const cached = readCachedBacktests(cacheKey);
        if (cached && !cancelled) {
          setReports(cached);
        }
      } catch {
        // Ignore cache restore failures; the user can still run manually.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDatasetReady, selectedStrategies]);

  function toggleStrategy(strategyId: string) {
    setSelectedIds((current) =>
      current.includes(strategyId)
        ? current.filter((id) => id !== strategyId)
        : [...current, strategyId],
    );
  }

  function saveFormula() {
    const name = formulaName.trim();
    if (!name) {
      setError("Give this formula a name before saving it.");
      return;
    }
    const saved: FormulaStrategy = {
      id: `saved-${crypto.randomUUID()}`,
      name: name.slice(0, 48),
      description: "Saved from the Rankings formula controls.",
      params: sanitiseParams(currentParams),
      source: "saved",
    };
    const nextStrategies = [...savedStrategies, saved];
    persistSavedStrategies(nextStrategies);
    setSelectedIds((current) => [...current, saved.id]);
    setFormulaName("");
    setError(null);
  }

  function deleteFormula(strategyId: string) {
    const nextStrategies = savedStrategies.filter((strategy) => strategy.id !== strategyId);
    persistSavedStrategies(nextStrategies);
    setSelectedIds((current) => current.filter((id) => id !== strategyId));
    setReports((current) => current.filter((report) => report.strategyId !== strategyId));
  }

  async function runBacktest() {
    if (!selectedStrategies.length) {
      setError("Choose at least one formula to track.");
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const syncKey = await getMosaicDatasetSyncKey();
      const cacheKey = buildBacktestCacheKey(syncKey, selectedStrategies.map((strategy) => strategy.id));
      const nextReports = await calculateFormulaBacktests(selectedStrategies, { cacheKey });
      setReports(nextReports);
      const best = [...selectedStrategies].sort(
        (left, right) => (nextReports.find((report) => report.strategyId === right.id)?.totalPoints ?? 0)
          - (nextReports.find((report) => report.strategyId === left.id)?.totalPoints ?? 0),
      )[0];
      if (best) setHighlightedId(best.id);
    } catch (reason) {
      setReports([]);
      setError(reason instanceof Error ? reason.message : "Unable to run the formula tracker.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[285px_1fr]">
      <div className="grid h-fit gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><SlidersHorizontal size={16} className="text-muted-foreground" /> Formula presets</CardTitle>
            <p className="text-sm text-muted-foreground">
              Same presets as Rankings. Select which ones to backtest, then run the tracker to see which has worked best so far.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2">
            {FORMULA_PRESETS.map((preset) => {
              const strategy = TRACKER_PRESET_STRATEGIES.find((entry) => entry.id === preset.id)!;
              const selected = selectedIds.includes(preset.id);
              const isCurrent = paramsMatch(currentParams, strategy.params);
              const report = reportByStrategy.get(preset.id);
              const isTop = topStrategy?.id === preset.id && reports.length > 0;
              return (
                <div
                  key={preset.id}
                  className={`rounded-lg border px-3 py-2 transition ${selected ? "border-cyan-300/40 bg-cyan-300/5" : "border-white/10 bg-slate-950/20 opacity-80"}`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      id={`preset-${preset.id}`}
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleStrategy(preset.id)}
                      className="mt-1 accent-primary"
                    />
                    <label htmlFor={`preset-${preset.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">{preset.name}</span>
                        {isCurrent && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">Live in Rankings</span>}
                        {isTop && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">Top backtest</span>}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-400">{preset.description}</span>
                      {report && (
                        <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                          {report.totalPoints.toFixed(0)} pts total · {report.averagePoints.toFixed(1)} avg/GW
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 pl-6">
                    <button
                      type="button"
                      onClick={() => {
                        setHighlightedId(preset.id);
                        applyStrategy(strategy);
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setHighlightedId(preset.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      View formula
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Save current Rankings formula</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              <span>Name</span>
              <input
                value={formulaName}
                onChange={(event) => setFormulaName(event.target.value)}
                maxLength={48}
                placeholder="e.g. My 60/20/20 blend"
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <button
              type="button"
              onClick={saveFormula}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <BookmarkPlus size={16} /> Save formula
            </button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles size={17} className="text-muted-foreground" /> Working formulas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Backtests pick the top 15 ranked players for each completed Gameweek using only information available before that Gameweek, then score them on actual returns.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {selectedStrategies.length} selected
                {!isDatasetReady ? " · Preparing dataset…" : reports.length ? " · Showing cached or latest backtest" : " · Run once to compare presets"}
              </p>
              <div className="flex flex-wrap gap-2">
                {topStrategy && reports.length > 0 && (
                  <button
                    type="button"
                    onClick={() => applyStrategy(topStrategy)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    Apply {topStrategy.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runBacktest()}
                  disabled={isRunning || !selectedStrategies.length || !isDatasetReady}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {isRunning ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />}
                  {isRunning ? "Tracking…" : reports.length ? "Refresh tracker" : "Run tracker"}
                </button>
              </div>
            </div>

            {savedStrategies.length > 0 && (
              <div className="grid gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saved formulas</p>
                {savedStrategies.map((strategy) => {
                  const selected = selectedIds.includes(strategy.id);
                  const report = reportByStrategy.get(strategy.id);
                  return (
                    <div key={strategy.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${selected ? "ring-1 ring-foreground/20" : "opacity-75"}`}>
                      <input
                        id={`strategy-${strategy.id}`}
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStrategy(strategy.id)}
                        className="accent-primary"
                      />
                      <label htmlFor={`strategy-${strategy.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block truncate font-medium">{strategy.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatParams(strategy.params)}</span>
                      </label>
                      {report && <span className="text-sm font-semibold tabular-nums">{report.totalPoints.toFixed(0)}</span>}
                      <button type="button" onClick={() => applyStrategy(strategy)} className="text-xs font-medium text-primary hover:underline">Apply</button>
                      <button type="button" onClick={() => deleteFormula(strategy.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Delete ${strategy.name}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <ScoreFormula params={highlightedStrategy.params} />
          </CardContent>
        </Card>

        {reports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy size={17} className="text-muted-foreground" /> Backtest leaderboard</CardTitle>
              <p className="text-sm text-muted-foreground">
                Sorted by total points across completed Gameweeks. Captaincy, prices, transfers, and formation rules are not simulated.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="pb-3 font-medium">Formula</th>
                    <th className="pb-3 text-right font-medium">Total points</th>
                    <th className="pb-3 text-right font-medium">Avg / GW</th>
                    <th className="pb-3 text-right font-medium">Best GWs</th>
                    <th className="pb-3 text-right font-medium">Full selections</th>
                    <th className="pb-3 text-right font-medium">Rankings</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStrategies.map((strategy, index) => {
                    const report = reportByStrategy.get(strategy.id);
                    if (!report) return null;
                    return (
                      <tr key={strategy.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">
                          {index + 1}. {strategy.name}
                          {index === 0 && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">Suggested</span>}
                        </td>
                        <td className="py-3 text-right font-semibold">{report.totalPoints.toFixed(0)}</td>
                        <td className="py-3 text-right">{report.averagePoints.toFixed(1)}</td>
                        <td className="py-3 text-right">{winningRounds.get(strategy.id) ?? 0}</td>
                        <td className="py-3 text-right">{report.completeSelections}/{report.rounds.length}</td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => applyStrategy(strategy)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            Apply
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
