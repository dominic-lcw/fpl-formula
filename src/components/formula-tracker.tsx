"use client";

import { BookmarkPlus, Database, LoaderCircle, Play, Trash2, Trophy } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateFormulaBacktests,
  STARTER_STRATEGIES,
  type FormulaStrategy,
  type StrategyBacktest,
} from "@/lib/formula-tracking-data";
import { sanitiseParams } from "@/lib/scoring";
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
        description: strategy.description || "Saved from the Formula Lab controls.",
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

function StrategyTrend({ report }: { report?: StrategyBacktest }) {
  const highest = Math.max(...(report?.rounds.map((round) => round.points) ?? []), 1);
  if (!report?.rounds.length) return <p className="text-sm text-muted-foreground">Run the tracker to see round scores.</p>;

  return (
    <div className="mt-4 flex h-12 items-end gap-px" aria-label={`${report.rounds.length} gameweek scores`}>
      {report.rounds.map((round) => (
        <span
          key={round.gameweek}
          title={`GW${round.gameweek}: ${round.points} points from ${round.pickedPlayers} players`}
          className="min-w-1 flex-1 rounded-t-sm bg-foreground/70"
          style={{ height: `${Math.max(8, (round.points / highest) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function FormulaTracker({ currentParams }: { currentParams: RankingParams }) {
  const savedStrategies = useSyncExternalStore(
    subscribeToSavedStrategies,
    readSavedStrategies,
    () => emptyStrategies,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() => STARTER_STRATEGIES.map((strategy) => strategy.id));
  const [formulaName, setFormulaName] = useState("");
  const [reports, setReports] = useState<StrategyBacktest[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strategies = useMemo(
    () => [...STARTER_STRATEGIES, ...savedStrategies],
    [savedStrategies],
  );
  const selectedStrategies = strategies.filter((strategy) => selectedIds.includes(strategy.id));
  const reportByStrategy = new Map(reports.map((report) => [report.strategyId, report]));
  const sortedStrategies = [...selectedStrategies].sort(
    (left, right) => (reportByStrategy.get(right.id)?.totalPoints ?? 0) - (reportByStrategy.get(left.id)?.totalPoints ?? 0),
  );
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
      description: "Saved from the Formula Lab controls.",
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
      setReports(await calculateFormulaBacktests(selectedStrategies));
    } catch (reason) {
      setReports([]);
      setError(reason instanceof Error ? reason.message : "Unable to run the formula tracker.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database size={17} className="text-muted-foreground" /> Formula tracker</CardTitle>
          <p className="text-sm text-muted-foreground">
            Backtest the top 15 ranked players for every completed Gameweek, from GW1 onward.
            The tracker runs in this browser against the local Parquet snapshot.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="rounded-md border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Performance signals use a strict cutoff</p>
            <p className="mt-1 leading-6 text-muted-foreground">
              For each Gameweek, form and team signals stop at the previous completed Gameweek. The selected 15 are then scored only on their points in that Gameweek.
            </p>
            <p className="mt-2 leading-6 text-muted-foreground">
              The current dataset keeps one roster snapshot, so historic player availability and transfers cannot yet be reconstructed. No target-Gameweek player performance is used to rank its picks.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="grid flex-1 gap-1.5 text-sm font-medium">
              <span>Save the formula currently shown in Rankings</span>
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
              className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <BookmarkPlus size={16} /> Save formula
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Strategies to compare</h2>
          <p className="mt-1 text-sm text-muted-foreground">{selectedStrategies.length} selected · eight starter formulas included</p>
        </div>
        <button
          type="button"
          onClick={() => void runBacktest()}
          disabled={isRunning || !selectedStrategies.length}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {isRunning ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />}
          {isRunning ? "Tracking…" : "Run tracker"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {strategies.map((strategy) => {
          const report = reportByStrategy.get(strategy.id);
          const selected = selectedIds.includes(strategy.id);
          return (
            <Card key={strategy.id} className={selected ? "ring-1 ring-foreground/20" : "opacity-75"}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <input
                    id={`strategy-${strategy.id}`}
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleStrategy(strategy.id)}
                    className="mt-1 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <label htmlFor={`strategy-${strategy.id}`} className="cursor-pointer font-medium">{strategy.name}</label>
                      {strategy.source === "saved" && (
                        <button
                          type="button"
                          onClick={() => deleteFormula(strategy.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label={`Delete ${strategy.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">{strategy.description}</p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{formatParams(strategy.params)}</p>
                    {report && (
                      <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-sm">
                        <div><p className="text-xs text-muted-foreground">Total</p><p className="mt-0.5 font-semibold">{report.totalPoints.toFixed(0)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Per GW</p><p className="mt-0.5 font-semibold">{report.averagePoints.toFixed(1)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Full 15</p><p className="mt-0.5 font-semibold">{report.completeSelections}</p></div>
                      </div>
                    )}
                    <StrategyTrend report={report} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy size={17} className="text-muted-foreground" /> Backtest leaderboard</CardTitle>
            <p className="text-sm text-muted-foreground">Points are the combined actual returns of each Gameweek&apos;s top 15 picks. Captaincy, prices, transfers, and formation rules are not simulated.</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="pb-3 font-medium">Formula</th><th className="pb-3 text-right font-medium">Total points</th><th className="pb-3 text-right font-medium">Avg / GW</th><th className="pb-3 text-right font-medium">Best GWs</th><th className="pb-3 text-right font-medium">Full selections</th></tr>
              </thead>
              <tbody>
                {sortedStrategies.map((strategy, index) => {
                  const report = reportByStrategy.get(strategy.id);
                  if (!report) return null;
                  return (
                    <tr key={strategy.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{index + 1}. {strategy.name}</td>
                      <td className="py-3 text-right font-semibold">{report.totalPoints.toFixed(0)}</td>
                      <td className="py-3 text-right">{report.averagePoints.toFixed(1)}</td>
                      <td className="py-3 text-right">{winningRounds.get(strategy.id) ?? 0}</td>
                      <td className="py-3 text-right">{report.completeSelections}/{report.rounds.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
