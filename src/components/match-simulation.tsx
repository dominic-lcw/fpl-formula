"use client";

import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyMonteCarloBatch,
  createMonteCarloAccumulator,
  SCORE_AXIS_MAX,
  SCORE_AXIS_SIZE,
  scoreAxisLabel,
  scoreCellIndex,
  snapshotMonteCarlo,
  type MonteCarloSnapshot,
} from "@/lib/match-forecast-model";
import {
  clampSimulationCount,
  MAX_MATCH_SIMULATIONS,
  MIN_MATCH_SIMULATIONS,
  monteCarloBatchSize,
  type FixtureSimulationSetup,
} from "@/lib/match-simulation";
import { viewHref } from "@/lib/dashboard-nav";

type SimulationFrame = MonteCarloSnapshot & {
  total: number;
  done: boolean;
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatKickoff(kickoffTime: string | null) {
  if (!kickoffTime) return null;
  const date = new Date(kickoffTime);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function waitForPaint(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(resolve, 32);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

async function streamMonteCarlo(
  setup: FixtureSimulationSetup,
  simulations: number,
  signal: AbortSignal,
  publish: (frame: SimulationFrame) => void,
) {
  const accumulator = createMonteCarloAccumulator(setup.lambdaShared);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  publish({ ...snapshotMonteCarlo(accumulator), total: simulations, done: false });

  while (accumulator.simulations < simulations) {
    if (signal.aborted) return;
    const batch = reducedMotion
      ? simulations - accumulator.simulations
      : monteCarloBatchSize(simulations, accumulator.simulations);
    const touched = applyMonteCarloBatch(
      accumulator,
      setup.lambdaHome,
      setup.lambdaAway,
      setup.correlation,
      batch,
    );
    const done = accumulator.simulations >= simulations;
    publish({ ...snapshotMonteCarlo(accumulator, touched), total: simulations, done });
    if (!done) await waitForPaint(signal);
  }
}

function emptyFrame(total: number): SimulationFrame {
  return { ...snapshotMonteCarlo(createMonteCarloAccumulator()), total, done: false };
}

export function ScorelineHeatmap({
  frame,
  homeLabel,
  awayLabel,
  actualHome,
  actualAway,
}: {
  frame: SimulationFrame;
  homeLabel: string;
  awayLabel: string;
  actualHome: number | null;
  actualAway: number | null;
}) {
  const maxCount = frame.counts.reduce((max, count) => Math.max(max, count), 0);
  const touched = new Set(frame.touched);
  const actualHomeBin = actualHome === null ? null : Math.min(SCORE_AXIS_MAX, Math.max(0, actualHome));
  const actualAwayBin = actualAway === null ? null : Math.min(SCORE_AXIS_MAX, Math.max(0, actualAway));
  const labels = Array.from({ length: SCORE_AXIS_SIZE }, (_, goals) => scoreAxisLabel(goals));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-center">
        <caption className="sr-only">
          Monte Carlo scoreline counts. Rows are {homeLabel} goals and columns are {awayLabel} goals.
          Counts update as samples stream in.
        </caption>
        <thead>
          <tr>
            <th className="p-1" />
            <th colSpan={labels.length} className="p-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {awayLabel} goals →
            </th>
          </tr>
          <tr>
            <th className="p-1 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {homeLabel} ↓
            </th>
            {labels.map((label) => (
              <th key={label} className="p-1 text-[11px] font-medium text-muted-foreground">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((rowLabel, home) => (
            <tr key={rowLabel}>
              <th className="px-2 text-sm font-semibold tabular-nums">{rowLabel}</th>
              {labels.map((columnLabel, away) => {
                const index = scoreCellIndex(home, away);
                const count = frame.counts[index] ?? 0;
                const intensity = maxCount > 0 ? count / maxCount : 0;
                const hit = touched.has(index);
                const isLikely = frame.mostLikely?.home === home && frame.mostLikely.away === away && count > 0;
                const isResult = actualHomeBin === home && actualAwayBin === away;
                return (
                  <td key={columnLabel} className="p-0">
                    <div
                      data-cell={`${home}-${away}`}
                      data-count={count}
                      title={`${rowLabel}–${columnLabel}: ${count.toLocaleString()}${frame.simulations > 0 ? ` (${formatPercent(count / frame.simulations)})` : ""}`}
                      className={`flex min-h-14 flex-col items-center justify-center rounded-md border px-1 py-1 ${
                        hit ? "mc-cell-hit" : ""
                      } ${isLikely ? "ring-2 ring-primary" : ""} ${isResult ? "outline outline-2 outline-offset-1 outline-amber-500" : ""}`}
                      style={{
                        backgroundColor: count === 0
                          ? "color-mix(in oklch, var(--muted) 55%, transparent)"
                          : `oklch(0.72 0.15 155 / ${0.14 + intensity * 0.72})`,
                      }}
                    >
                      <span className={`text-sm font-semibold tabular-nums ${count === 0 ? "text-muted-foreground/70" : ""}`}>
                        {count.toLocaleString()}
                      </span>
                      <span className={`text-[10px] tabular-nums ${count === 0 ? "text-transparent" : "text-muted-foreground"}`}>
                        {frame.simulations > 0 ? formatPercent(count / Math.max(frame.simulations, 1)) : "0%"}
                      </span>
                      {isResult ? <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">FT</span> : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{formatPercent(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-600/80 dark:bg-emerald-400/80"
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

export function MatchSimulationPage({ fixtureId }: { fixtureId: string }) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [setup, setSetup] = useState<FixtureSimulationSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftN, setDraftN] = useState(searchParams.get("simulations") ?? "5000");
  const [job, setJob] = useState<{ id: number; n: number } | null>(null);
  const [frame, setFrame] = useState<SimulationFrame>(() => emptyFrame(clampSimulationCount(Number(searchParams.get("simulations")))));
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/forecast/${fixtureId}?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as FixtureSimulationSetup & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load this match.");
        if (controller.signal.aborted) return;
        const simulations = clampSimulationCount(payload.simulations);
        setSetup(payload);
        setDraftN(String(simulations));
        setFrame(emptyFrame(simulations));
        setJob({ id: 1, n: simulations });
      } catch (reason) {
        if (controller.signal.aborted) return;
        setSetup(null);
        setError(reason instanceof Error ? reason.message : "Unable to load this match.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [fixtureId, query]);

  useEffect(() => {
    if (!setup || !job) return;
    const controller = new AbortController();
    setRunning(true);
    void streamMonteCarlo(setup, job.n, controller.signal, (next) => {
      if (!controller.signal.aborted) setFrame(next);
    }).finally(() => {
      if (!controller.signal.aborted) setRunning(false);
    });
    return () => controller.abort();
  }, [setup, job]);

  function redo(event: FormEvent) {
    event.preventDefault();
    const simulations = clampSimulationCount(Number(draftN), job?.n ?? 5_000);
    setDraftN(String(simulations));
    setJob({ id: (job?.id ?? 0) + 1, n: simulations });
  }

  const kickoff = setup ? formatKickoff(setup.kickoffTime) : null;
  const likelyLabel = frame.mostLikely
    ? `${scoreAxisLabel(frame.mostLikely.home)}–${scoreAxisLabel(frame.mostLikely.away)}`
    : "—";

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={viewHref.forecast} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All fixtures
        </Link>
        {setup ? (
          <p className="text-sm text-muted-foreground">
            {setup.season} · GW{setup.event ?? "?"}{kickoff ? ` · ${kickoff}` : ""}
          </p>
        ) : null}
      </div>

      {loading && !setup ? (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
          Loading match rates…
        </div>
      ) : null}

      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      {setup ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {setup.homeTeam}
                <span className="mx-2 text-muted-foreground">vs</span>
                {setup.awayTeam}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                λ {setup.lambdaHome.toFixed(2)}–{setup.lambdaAway.toFixed(2)} · shared {setup.lambdaShared.toFixed(2)} · bivariate Poisson
                {setup.finished && setup.homeScore !== null && setup.awayScore !== null
                  ? ` · full time ${setup.homeScore}–${setup.awayScore}`
                  : ""}
              </p>
            </div>
            <form onSubmit={redo} className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Simulations (n)</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={MIN_MATCH_SIMULATIONS}
                  max={MAX_MATCH_SIMULATIONS}
                  step={100}
                  value={draftN}
                  onChange={(event) => setDraftN(event.target.value)}
                  className="w-36 tabular-nums"
                  aria-describedby="simulation-n-hint"
                />
              </label>
              <Button type="submit" disabled={loading}>
                <RefreshCw className={running ? "animate-spin" : ""} />
                Redo simulation
              </Button>
            </form>
          </div>
          <p id="simulation-n-hint" className="text-xs text-muted-foreground">
            Between {MIN_MATCH_SIMULATIONS.toLocaleString()} and {MAX_MATCH_SIMULATIONS.toLocaleString()} samples. Redo clears the grid and streams a new run.
          </p>

          <div className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {running ? "Streaming samples" : frame.done ? "Run complete" : "Ready"}
                </p>
                <p className="text-3xl font-semibold tabular-nums tracking-tight">
                  {frame.simulations.toLocaleString()}
                  <span className="ml-2 text-base font-medium text-muted-foreground">/ {frame.total.toLocaleString()}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Most likely <span className="font-semibold text-foreground">{likelyLabel}</span>
                {frame.mostLikely && frame.simulations > 0 ? ` · ${formatPercent(frame.mostLikely.count / frame.simulations)}` : ""}
              </p>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                style={{ width: `${frame.total > 0 ? (frame.simulations / frame.total) * 100 : 0}%` }}
              />
            </div>
            <ScorelineHeatmap
              frame={frame}
              homeLabel={setup.homeShortName}
              awayLabel={setup.awayShortName}
              actualHome={setup.finished ? setup.homeScore : null}
              actualAway={setup.finished ? setup.awayScore : null}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Each cell is a scoreline. The count is how many simulated matches landed there. 7+ gathers every higher score.
              {setup.finished ? " The full-time score is outlined." : ""}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Result probabilities</p>
              <OutcomeMeter label={`${setup.homeShortName} win`} value={frame.homeWinProb} />
              <OutcomeMeter label="Draw" value={frame.drawProb} />
              <OutcomeMeter label={`${setup.awayShortName} win`} value={frame.awayWinProb} />
            </div>
            <div className="grid content-start gap-3 rounded-xl border bg-card p-4 shadow-xs text-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Running totals</p>
              <p>Expected goals <span className="font-semibold tabular-nums">{frame.expectedHomeGoals.toFixed(2)}–{frame.expectedAwayGoals.toFixed(2)}</span></p>
              <p>Over 2.5 <span className="font-semibold tabular-nums">{formatPercent(frame.over25Prob)}</span></p>
              <p>Both teams to score <span className="font-semibold tabular-nums">{formatPercent(frame.bttsProb)}</span></p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
