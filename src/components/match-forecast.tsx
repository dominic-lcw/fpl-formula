"use client";

import {
  Calculator,
  ChevronDown,
  FileText,
  LoaderCircle,
  Receipt,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type Ref } from "react";
import { BookingProbabilityScatter } from "@/components/booking-probability-scatter";
import { BookedPnlStrip, MatchdayOnePager } from "@/components/matchday-one-pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { GameweekBookedPnl } from "@/lib/booked-pnl";
import type { BookingMarket, BookingRecord } from "@/lib/booking-settlement";
import type { GameweekSlateRow, GameweekSlateSummary } from "@/lib/gameweek-slate";
import { buildKellyPlan, type BookingStrategy, type KellyBet } from "@/lib/kelly";
import { buildMatchdayOnePager } from "@/lib/matchday-one-pager";
import type { FixtureForecast, ForecastParams, TeamStrength } from "@/lib/match-forecast-model";
import { DEFAULT_FORECAST_PARAMS } from "@/lib/match-forecast-model";

type ForecastResponse = {
  season: string | null;
  currentGameweek: number | null;
  leagueAverageGoals: number | null;
  homeAdvantage: number;
  teamStrengths: TeamStrength[];
  upcomingFixtures: FixtureForecast[];
  availableGameweeks: number[];
  defaultGameweek: number | null;
};

type ForecastSubView = "fixtures" | "strengths" | "bookings";

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPnl(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function parseDecimalOdds(value: string) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds > 1 ? odds : null;
}

export function pendingRowsWithOpenOdds(
  rows: GameweekSlateRow[],
  rowOdds: Record<number, string>,
  defaultOdds: string,
  priceClosed: Record<number, boolean> = {},
) {
  return rows.filter((row) => {
    if (row.booking || row.finished || !row.modelPick || priceClosed[row.fixtureId]) return false;
    return parseDecimalOdds(rowOdds[row.fixtureId] ?? defaultOdds) !== null;
  });
}

function selectionLabel(market: BookingMarket, selection: string) {
  switch (market) {
    case "1X2":
      if (selection === "home") return "Home win";
      if (selection === "draw") return "Draw";
      if (selection === "away") return "Away win";
      return selection;
    case "over_under":
      return selection === "over_2.5" ? "Over 2.5" : "Under 2.5";
    case "btts":
      return selection === "yes" ? "BTTS yes" : "BTTS no";
    case "correct_score":
      return selection;
    default:
      return selection;
  }
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

function predictedWinner(fixture: FixtureForecast) {
  const outcomes = [
    { label: `${fixture.homeShortName} win`, prob: fixture.homeWinProb },
    { label: "Draw", prob: fixture.drawProb },
    { label: `${fixture.awayShortName} win`, prob: fixture.awayWinProb },
  ];
  return outcomes.sort((left, right) => right.prob - left.prob)[0]!;
}

function mostLikelyScoreline(fixture: FixtureForecast) {
  return fixture.topScorelines[0] ?? null;
}

export function RealizedMatchCard({ row }: { row: GameweekSlateRow }) {
  const booking = row.booking;
  const kickoff = formatKickoff(row.kickoffTime);
  const homeScore = booking?.homeScore ?? row.homeScore;
  const awayScore = booking?.awayScore ?? row.awayScore;
  const hasScore = homeScore !== null && awayScore !== null;
  const status = !booking
    ? "Played"
    : booking.status === "open"
      ? "Open"
      : booking.outcome === "won"
        ? "Won"
        : "Lost";

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5 text-left shadow-xs">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          GW{row.gameweek}{kickoff ? ` · ${kickoff}` : ""}
        </p>
        <Badge
          className={
            status === "Won"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : status === "Lost"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
          }
        >
          {status}
        </Badge>
      </div>

      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight">{row.homeShortName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.homeTeam}</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-sm font-semibold tabular-nums">
          {hasScore ? `${homeScore}–${awayScore}` : "vs"}
        </span>
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight">{row.awayShortName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.awayTeam}</p>
        </div>
      </div>

      {row.modelScoreline ? (
        <div className="mb-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Model score</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{row.modelScoreline.home}–{row.modelScoreline.away}</p>
          <p className="text-xs text-muted-foreground">{formatPercent(row.modelScoreline.probability)}</p>
          {row.expectedHomeGoals != null && row.expectedAwayGoals != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Expected {row.expectedHomeGoals.toFixed(2)}–{row.expectedAwayGoals.toFixed(2)}
            </p>
          ) : null}
        </div>
      ) : null}

      {booking ? (
        <div className="mt-auto grid gap-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Forecast when booked</p>
            <p className="mt-1 text-sm font-semibold">{selectionLabel(booking.market, booking.selection)}</p>
            <p className="text-xs text-muted-foreground">{formatPercent(booking.modelProb)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Expected {booking.expectedHomeGoals.toFixed(2)}–{booking.expectedAwayGoals.toFixed(2)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Odds</p>
              <p className="font-semibold tabular-nums">{booking.odds.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stake</p>
              <p className="font-semibold tabular-nums">${booking.stake.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">PnL</p>
              <p className={`font-semibold tabular-nums ${booking.pnl === null ? "text-muted-foreground" : booking.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {booking.pnl === null ? "—" : formatPnl(booking.pnl)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-auto text-sm text-muted-foreground">Played. No bet was booked for this match.</p>
      )}
    </article>
  );
}

function FixtureForecastCard({
  fixture,
  booked,
}: {
  fixture: FixtureForecast;
  booked: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const winner = predictedWinner(fixture);
  const scoreline = mostLikelyScoreline(fixture);
  const kickoff = formatKickoff(fixture.kickoffTime);
  const topScorelines = fixture.topScorelines.slice(0, 3);

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((current) => !current)}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-5 text-left shadow-xs transition hover:border-primary/40 hover:bg-accent/20"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          GW{fixture.event ?? "?"}{kickoff ? ` · ${kickoff}` : ""}
        </p>
        <div className="flex items-center gap-2">
          {booked ? <Badge className="bg-primary/10 text-primary">Booked</Badge> : null}
          <ChevronDown className={`size-4 text-muted-foreground transition ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight">{fixture.homeShortName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{fixture.homeTeam}</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">vs</span>
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight">{fixture.awayShortName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{fixture.awayTeam}</p>
        </div>
      </div>

      <div className="mt-auto grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Predicted winner</p>
          <p className="mt-1 text-sm font-semibold">{winner.label}</p>
          <p className="text-xs text-muted-foreground">{formatPercent(winner.prob)}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Most likely score</p>
          {scoreline ? (
            <>
              <p className="mt-1 text-sm font-semibold">{scoreline.home}-{scoreline.away}</p>
              <p className="text-xs text-muted-foreground">{formatPercent(scoreline.prob)}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Top 3 scorelines</p>
          {topScorelines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No simulation data.</p>
          ) : (
            <div className="grid gap-2">
              {topScorelines.map((line, index) => (
                <div key={`${line.home}-${line.away}`} className="grid grid-cols-[1.5rem_3rem_1fr_auto] items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <span className="font-semibold tabular-nums">{line.home}-{line.away}</span>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary/70"
                      style={{ width: `${Math.max(8, line.prob * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">{formatPercent(line.prob)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-1 text-xs text-muted-foreground">
            <p>Expected {fixture.expectedHomeGoals.toFixed(2)}–{fixture.expectedAwayGoals.toFixed(2)}</p>
            <p>H/D/A {formatPercent(fixture.homeWinProb)}/{formatPercent(fixture.drawProb)}/{formatPercent(fixture.awayWinProb)}</p>
            <p>Over 2.5 {formatPercent(fixture.over25Prob)} · BTTS {formatPercent(fixture.bttsProb)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          <p>Expected {fixture.expectedHomeGoals.toFixed(2)}–{fixture.expectedAwayGoals.toFixed(2)}</p>
          <p className="mt-1">
            H/D/A {formatPercent(fixture.homeWinProb)}/{formatPercent(fixture.drawProb)}/{formatPercent(fixture.awayWinProb)}
          </p>
          <p className="mt-2 font-medium text-primary">Click for top scorelines</p>
        </div>
      )}
    </button>
  );
}

function ParameterSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="flex justify-between">
        <span>{label}</span>
        <strong>{step < 1 ? value.toFixed(2) : value}</strong>
      </span>
      <input
        className="accent-primary"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function StrengthBar({ value, tone }: { value: number; tone: "attack" | "defence" }) {
  const width = Math.min(100, Math.max(8, (value / 2.2) * 100));
  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className={`h-2 rounded-full ${tone === "attack" ? "bg-emerald-500/80" : "bg-sky-500/80"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function GameweekSelect({
  gameweeks,
  value,
  onChange,
}: {
  gameweeks: number[];
  value: number;
  onChange: (gameweek: number) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">Gameweek</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {gameweeks.map((gameweek) => (
          <option key={gameweek} value={gameweek}>Gameweek {gameweek}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted-foreground" size={15} />
    </label>
  );
}

function SubViewNav({
  activeView,
  onNavigate,
}: {
  activeView: ForecastSubView;
  onNavigate: (view: ForecastSubView) => void;
}) {
  const tabs: Array<{ id: ForecastSubView; label: string; icon: typeof Target }> = [
    { id: "fixtures", label: "Fixtures", icon: Target },
    { id: "bookings", label: "Bookings", icon: Receipt },
    { id: "strengths", label: "Team strength", icon: TrendingUp },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onNavigate(tab.id)}
          className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
            activeView === tab.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-input bg-background hover:bg-accent"
          }`}
        >
          <tab.icon className="size-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ModelControls({
  params,
  isRecomputing = false,
  onChange,
}: {
  params: ForecastParams;
  isRecomputing?: boolean;
  onChange: (updater: (current: ForecastParams) => ForecastParams) => void;
}) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4 text-muted-foreground" />
          Model controls
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Predictions recompute as you adjust each control.
          {isRecomputing ? " Updating…" : ""}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ParameterSlider
          label="Lookback (GWs)"
          value={params.lookbackGameweeks}
          min={3}
          max={20}
          onChange={(value) => onChange((current) => ({ ...current, lookbackGameweeks: value }))}
        />
        <ParameterSlider
          label="Home advantage"
          value={params.homeAdvantage}
          min={1}
          max={1.35}
          step={0.01}
          onChange={(value) => onChange((current) => ({ ...current, homeAdvantage: value }))}
        />
        <ParameterSlider
          label="Bivariate correlation (λ₃)"
          value={params.correlation}
          min={0}
          max={0.25}
          step={0.01}
          onChange={(value) => onChange((current) => ({ ...current, correlation: value }))}
        />
        <ParameterSlider
          label="FPL strength blend"
          value={params.fplStrengthBlend}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => onChange((current) => ({ ...current, fplStrengthBlend: value }))}
        />
        <ParameterSlider
          label="Monte Carlo runs"
          value={params.simulations}
          min={1000}
          max={25000}
          step={1000}
          onChange={(value) => onChange((current) => ({ ...current, simulations: value }))}
        />
      </CardContent>
    </Card>
  );
}

function TeamStrengthsPanel({
  data,
}: {
  data: ForecastResponse;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          Team attack &amp; defence strength
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {data.season} · GW{data.currentGameweek ?? "?"} · league avg {data.leagueAverageGoals?.toFixed(2) ?? "—"} goals per team per match
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Attack (H/A)</th>
              <th className="py-2 pr-3">Defence (H/A)</th>
              <th className="py-2">Matches</th>
            </tr>
          </thead>
          <tbody>
            {data.teamStrengths.map((team) => (
              <tr key={team.teamId} className="border-b border-border/60">
                <td className="py-2 pr-3 font-medium">{team.shortName}</td>
                <td className="py-2 pr-3">
                  <div className="grid gap-1">
                    <StrengthBar value={team.attackHome} tone="attack" />
                    <StrengthBar value={team.attackAway} tone="attack" />
                    <span className="text-xs text-muted-foreground">
                      {team.attackHome.toFixed(2)} / {team.attackAway.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <div className="grid gap-1">
                    <StrengthBar value={team.defenceHome} tone="defence" />
                    <StrengthBar value={team.defenceAway} tone="defence" />
                    <span className="text-xs text-muted-foreground">
                      {team.defenceHome.toFixed(2)} / {team.defenceAway.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td className="py-2">{team.matchesPlayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Formula</p>
          <p className="mt-1">λ<sub>home</sub> = league avg × attack<sub>home</sub> × defence<sub>away</sub> × home advantage</p>
          <p>λ<sub>away</sub> = league avg × attack<sub>away</sub> × defence<sub>home</sub></p>
          <p>Attack and defence are James–Stein shrunk toward their own group mean before the FPL blend. Outliers move in, and the group average stays put.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function resultLabel(homeShortName: string, awayShortName: string, selection: "home" | "draw" | "away") {
  if (selection === "home") return `${homeShortName} win`;
  if (selection === "away") return `${awayShortName} win`;
  return "Draw";
}

function BookingSummaryCards({ summary }: { summary: GameweekSlateSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Open stake</p>
        <p className="mt-2 text-xl font-semibold">${summary.openStake.toFixed(2)}</p>
        <p className="text-sm text-muted-foreground">{summary.openCount} open</p>
      </div>
      <div className="rounded-xl border p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Settled PnL</p>
        <p className={`mt-2 text-xl font-semibold ${summary.settledPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {formatPnl(summary.settledPnl)}
        </p>
        <p className="text-sm text-muted-foreground">{summary.settledCount} settled</p>
      </div>
      <div className="rounded-xl border p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Record</p>
        <p className="mt-2 text-xl font-semibold">{summary.won}–{summary.lost}</p>
        <p className="text-sm text-muted-foreground">Won–lost</p>
      </div>
    </div>
  );
}

function GameweekBookingTable({
  gameweek,
  rows,
  stake,
  defaultOdds,
  rowOdds,
  isBooking,
  isClearing,
  onStakeChange,
  onDefaultOddsChange,
  onRowOddsChange,
  onBookAll,
  onBookRow,
  bookingFixtureId = null,
  priceClosed = {},
  onPriceOpenChange,
  strategy = "largest",
  capital = "1000",
  onStrategyChange,
  onCapitalChange,
  kellyBets = [],
  kellyPassed = 0,
  kellyScaled = false,
  onClear,
  canResolve,
  isResolving = false,
  resolveMessage = null,
  onResolve,
}: {
  gameweek: number;
  rows: GameweekSlateRow[];
  stake: string;
  defaultOdds: string;
  rowOdds: Record<number, string>;
  isBooking: boolean;
  isClearing: boolean;
  onStakeChange: (stake: string) => void;
  onDefaultOddsChange: (odds: string) => void;
  onRowOddsChange: (fixtureId: number, odds: string) => void;
  onBookAll: () => void;
  onBookRow: (fixtureId: number) => void;
  bookingFixtureId?: number | null;
  priceClosed?: Record<number, boolean>;
  onPriceOpenChange: (fixtureId: number, open: boolean) => void;
  strategy?: BookingStrategy;
  capital?: string;
  onStrategyChange?: (strategy: BookingStrategy) => void;
  onCapitalChange?: (capital: string) => void;
  kellyBets?: KellyBet[];
  kellyPassed?: number;
  kellyScaled?: boolean;
  onClear: () => void;
  canResolve?: boolean;
  isResolving?: boolean;
  resolveMessage?: string | null;
  onResolve?: () => void;
}) {
  const pending = rows.filter((row) => !row.booking && !row.finished && row.modelPick);
  const openPending = pending.filter((row) => !priceClosed[row.fixtureId]);
  const leftOut = pending.length - openPending.length;
  const kellyById = new Map(kellyBets.map((bet) => [bet.fixtureId, bet]));
  const kellyRows = rows.flatMap((row) => {
    const bet = kellyById.get(row.fixtureId);
    return bet ? [{ row, bet }] : [];
  });
  const kellyTotal = kellyBets.reduce((sum, bet) => sum + bet.stake, 0);
  const capitalValue = Number(capital);
  const kellyMode = strategy === "kelly";
  const bookCount = kellyMode ? kellyBets.length : openPending.length;
  const bookedCount = rows.filter((row) => row.booking).length;
  const showResolve = canResolve ?? rows.some((row) => row.booking?.status === "open");
  const busy = isBooking || isClearing || isResolving;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Gameweek {gameweek}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {kellyMode
                ? "Enter the stake you want to place. The list is the final bet, and To pay is the amount to put down. A price with no edge stays off the list."
                : "Largest chance books the most likely result at the stake and odds you enter, even when that chance is below the price. Uncheck Open when a price is not available."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showResolve ? (
              <Button
                type="button"
                variant="outline"
                data-resolve-live=""
                disabled={busy || !onResolve}
                onClick={onResolve}
                title="Check provisional and live FPL scores, then settle open bookings."
              >
                {isResolving ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {isResolving ? "Resolving…" : "Live resolve"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              data-clear-gameweek=""
              disabled={busy || bookedCount === 0}
              onClick={onClear}
            >
              {isClearing ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {isClearing ? "Clearing…" : `Clear GW${gameweek}`}
            </Button>
            <button
              type="button"
              disabled={busy || bookCount === 0}
              onClick={onBookAll}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isBooking && bookingFixtureId === null ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {pending.length === 0
                ? "All booked"
                : bookCount === 0
                  ? (kellyMode ? "No Kelly bets" : "No open prices")
                  : kellyMode
                    ? `Book · pay $${kellyTotal.toFixed(2)}`
                    : `Book ${bookCount} match${bookCount === 1 ? "" : "es"}`}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1 text-sm" role="group" aria-label="Booking strategy">
            Strategy
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={kellyMode ? "outline" : "default"}
                aria-pressed={!kellyMode}
                data-strategy-option="largest"
                onClick={() => onStrategyChange?.("largest")}
              >
                Largest chance
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kellyMode ? "default" : "outline"}
                aria-pressed={kellyMode}
                data-strategy-option="kelly"
                onClick={() => onStrategyChange?.("kelly")}
              >
                Kelly
              </Button>
            </div>
          </div>
          {kellyMode ? (
            <label className="grid gap-1 text-sm">
              Stake ($)
              <Input
                value={capital}
                onChange={(event) => onCapitalChange?.(event.target.value)}
                inputMode="decimal"
                aria-label="Stake to place"
                className="w-28"
              />
            </label>
          ) : (
            <label className="grid gap-1 text-sm">
              Stake ($)
              <Input
                value={stake}
                onChange={(event) => onStakeChange(event.target.value)}
                inputMode="decimal"
                aria-label="Stake for each match"
                className="w-28"
              />
            </label>
          )}
          <label className="grid gap-1 text-sm">
            Odds for every match
            <Input value={defaultOdds} onChange={(event) => onDefaultOddsChange(event.target.value)} inputMode="decimal" className="w-28" />
          </label>
          {leftOut > 0 ? (
            <p className="self-end text-sm text-muted-foreground" data-left-out="">
              {leftOut} match{leftOut === 1 ? "" : "es"} left out until the price is open.
            </p>
          ) : null}
        </div>
        {kellyMode ? (
          <div data-kelly-list="" className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To pay</p>
                <p className="text-2xl font-semibold tabular-nums" data-to-pay="">
                  {kellyRows.length === 0 || !Number.isFinite(capitalValue) || capitalValue <= 0
                    ? "$0.00"
                    : `$${kellyTotal.toFixed(2)}`}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {kellyRows.length === 0 || !Number.isFinite(capitalValue) || capitalValue <= 0
                  ? "No open price has an edge yet."
                  : `${kellyRows.length} bet${kellyRows.length === 1 ? "" : "s"} from your $${capitalValue.toFixed(2)} stake`}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {kellyScaled
                ? "These prices would cost more than your stake, so each line is scaled down and you pay the stake you entered."
                : "You pay the Kelly amount, which stays inside the stake you entered."}
            </p>
            {kellyRows.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-sm">
                {kellyRows.map(({ row, bet }) => (
                  <li key={row.fixtureId} data-kelly-row={row.fixtureId} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{row.homeShortName} vs {row.awayShortName}</span>
                      <span className="text-muted-foreground"> · {resultLabel(row.homeShortName, row.awayShortName, (row.modelPick?.selection ?? "home") as "home" | "draw" | "away")} · {formatPercent(bet.probability)} · {bet.odds.toFixed(2)}</span>
                    </span>
                    <span className="font-medium tabular-nums">${bet.stake.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {kellyPassed > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground" data-kelly-passed="">
                {kellyPassed} open price{kellyPassed === 1 ? " has no edge and stays" : "s have no edge and stay"} off the list.
              </p>
            ) : null}
          </div>
        ) : null}
        {resolveMessage ? <p className="text-sm text-muted-foreground" data-resolve-message="">{resolveMessage}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Match</th>
                <th className="py-2 pr-3">Pick</th>
                <th className="py-2 pr-3">Stake</th>
                <th className="py-2 pr-3">Odds</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">PnL</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Book</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const booking = row.booking;
                const pick = booking
                  ? { selection: booking.selection, market: booking.market, probability: booking.modelProb }
                  : row.modelPick;
                const kickoff = formatKickoff(row.kickoffTime);
                const score = booking?.homeScore ?? row.homeScore;
                const opponentScore = booking?.awayScore ?? row.awayScore;
                const kellyBet = kellyById.get(row.fixtureId);
                const enteredOdds = parseDecimalOdds(rowOdds[row.fixtureId] ?? defaultOdds);
                const belowPrice = !kellyMode && !booking && !row.finished && row.modelPick !== null && enteredOdds !== null
                  && row.modelPick.probability < 1 / enteredOdds;
                const enteredStake = Number(stake);

                return (
                  <tr key={row.fixtureId} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{row.homeShortName} vs {row.awayShortName}</p>
                      <p className="text-xs text-muted-foreground">{kickoff ?? row.homeTeam}</p>
                    </td>
                    <td className="py-2 pr-3">
                      {pick ? (
                        <>
                          <p className="font-medium">
                            {booking
                              ? selectionLabel(booking.market, booking.selection)
                              : resultLabel(row.homeShortName, row.awayShortName, pick.selection as "home" | "draw" | "away")}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatPercent(pick.probability)}</p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {booking ? (
                        `$${booking.stake.toFixed(2)}`
                      ) : kellyMode && kellyBet && capitalValue > 0 ? (
                        <span data-kelly-stake={row.fixtureId}>
                          <span className="font-medium tabular-nums">${kellyBet.stake.toFixed(2)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatPercent(kellyBet.stake / capitalValue)} of your stake
                          </span>
                        </span>
                      ) : kellyMode && !row.finished && row.modelPick && !priceClosed[row.fixtureId] && enteredOdds !== null ? (
                        <span className="text-muted-foreground" data-kelly-passed-row={row.fixtureId}>No edge</span>
                      ) : !kellyMode && !row.finished && row.modelPick && Number.isFinite(enteredStake) && enteredStake > 0 ? (
                        <span>
                          <span className="tabular-nums">${enteredStake.toFixed(2)}</span>
                          {belowPrice ? (
                            <span className="block text-xs text-muted-foreground" data-below-price={row.fixtureId}>Below the price</span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {booking ? (
                        booking.odds.toFixed(2)
                      ) : row.finished ? (
                        "—"
                      ) : (
                        <Input
                          value={rowOdds[row.fixtureId] ?? defaultOdds}
                          onChange={(event) => onRowOddsChange(row.fixtureId, event.target.value)}
                          inputMode="decimal"
                          aria-label={`Odds for ${row.homeShortName} vs ${row.awayShortName}`}
                          className="h-8 w-24"
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {score === null || opponentScore === null ? "—" : `${score}–${opponentScore}`}
                    </td>
                    <td className={`py-2 pr-3 ${booking?.pnl === null || booking?.pnl === undefined ? "text-muted-foreground" : booking.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                      {booking?.pnl === null || booking?.pnl === undefined ? "—" : formatPnl(booking.pnl)}
                    </td>
                    <td className="py-2 pr-3">
                      {!booking ? (row.finished ? "Played" : "—") : booking.status === "open" ? "Open" : booking.outcome === "won" ? "Won" : "Lost"}
                    </td>
                    <td className="py-2">
                      {!booking && !row.finished && row.modelPick ? (
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!priceClosed[row.fixtureId]}
                              disabled={busy}
                              data-price-open={row.fixtureId}
                              aria-label={`Price open for ${row.homeShortName} vs ${row.awayShortName}`}
                              onChange={(event) => onPriceOpenChange(row.fixtureId, event.target.checked)}
                            />
                            Open
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            data-book-row={row.fixtureId}
                            disabled={busy || Boolean(priceClosed[row.fixtureId]) || parseDecimalOdds(rowOdds[row.fixtureId] ?? defaultOdds) === null || (kellyMode && !kellyBet)}
                            title={kellyMode && !kellyBet ? "No Kelly edge at these odds." : undefined}
                            onClick={() => onBookRow(row.fixtureId)}
                            aria-label={`Book ${row.homeShortName} vs ${row.awayShortName}`}
                          >
                            {bookingFixtureId === row.fixtureId ? <LoaderCircle className="size-4 animate-spin" /> : null}
                            Book
                          </Button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function GameweekBookingsView({
  summary,
  scatterRef,
  ...tableProps
}: {
  summary: GameweekSlateSummary;
  scatterRef?: Ref<HTMLDivElement>;
} & ComponentProps<typeof GameweekBookingTable>) {
  const showScatter = tableProps.rows.some((row) => row.booking && row.booking.odds > 1);

  return (
    <div className="grid gap-5">
      <BookingSummaryCards summary={summary} />
      <GameweekBookingTable {...tableProps} />
      {showScatter ? (
        <div ref={scatterRef} id="booking-probability-scatter" className="scroll-mt-6">
          <BookingProbabilityScatter rows={tableProps.rows} />
        </div>
      ) : null}
    </div>
  );
}

export function MatchForecastPanel() {
  const [params, setParams] = useState<ForecastParams>(DEFAULT_FORECAST_PARAMS);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [subView, setSubView] = useState<ForecastSubView>("fixtures");
  const [selectedGameweek, setSelectedGameweek] = useState<number | null>(null);
  const hasInitializedGameweek = useRef(false);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [pnlHistory, setPnlHistory] = useState<GameweekBookedPnl[]>([]);
  const [onePagerOpen, setOnePagerOpen] = useState(false);
  const [slateRows, setSlateRows] = useState<GameweekSlateRow[]>([]);
  const [slateSummary, setSlateSummary] = useState<GameweekSlateSummary>({
    settledPnl: 0,
    openStake: 0,
    settledCount: 0,
    openCount: 0,
    won: 0,
    lost: 0,
    unbookedCount: 0,
  });
  const [bookingGameweeks, setBookingGameweeks] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSlateLoading, setIsSlateLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingFixtureId, setBookingFixtureId] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveMessage, setResolveMessage] = useState<string | null>(null);
  const [stake, setStake] = useState("10");
  const [strategy, setStrategy] = useState<BookingStrategy>("largest");
  const [capital, setCapital] = useState("1000");
  const [defaultOdds, setDefaultOdds] = useState("2.10");
  const [rowOdds, setRowOdds] = useState<Record<number, string>>({});
  const [priceClosed, setPriceClosed] = useState<Record<number, boolean>>({});
  const latestRequest = useRef(0);
  const latestSlateRequest = useRef(0);
  const scatterRef = useRef<HTMLDivElement>(null);
  const scrollScatterIntoView = useRef(false);
  const bookingLock = useRef(false);

  const fixtureGameweeks = useMemo(() => data?.availableGameweeks ?? [], [data?.availableGameweeks]);
  const activeGameweeks = useMemo(
    () => (subView === "bookings" && bookingGameweeks.length > 0 ? bookingGameweeks : fixtureGameweeks),
    [bookingGameweeks, fixtureGameweeks, subView],
  );
  const defaultGameweek = data?.defaultGameweek ?? null;
  const resolvedGameweek = (() => {
    const gameweeks = activeGameweeks;
    const fallback = (defaultGameweek != null && gameweeks.includes(defaultGameweek))
      ? defaultGameweek
      : (gameweeks[0] ?? defaultGameweek ?? 1);
    if (!gameweeks.length) return selectedGameweek ?? fallback;
    if (selectedGameweek != null && gameweeks.includes(selectedGameweek)) return selectedGameweek;
    return fallback;
  })();

  useEffect(() => {
    if (!data?.defaultGameweek || hasInitializedGameweek.current) return;
    setSelectedGameweek(data.defaultGameweek);
    hasInitializedGameweek.current = true;
  }, [data?.defaultGameweek]);

  const gameweekFixtures = useMemo(
    () => data?.upcomingFixtures.filter((fixture) => fixture.event === resolvedGameweek) ?? [],
    [data?.upcomingFixtures, resolvedGameweek],
  );
  const realizedRows = useMemo(
    () => slateRows.filter((row) => row.gameweek === resolvedGameweek),
    [resolvedGameweek, slateRows],
  );
  const slateReady = !isSlateLoading && slateRows.every((row) => row.gameweek === resolvedGameweek);

  const openBookingsByFixture = useMemo(() => {
    const ids = new Set<number>();
    for (const booking of bookings) {
      if (booking.status === "open") ids.add(booking.fixtureId);
    }
    return ids;
  }, [bookings]);

  const loadBookings = useCallback(async (
    season?: string | null,
    gameweek?: number,
    forecastParams: ForecastParams = DEFAULT_FORECAST_PARAMS,
    options?: { skipSettlement?: boolean },
  ) => {
    if (!season) return false;
    const requestId = ++latestSlateRequest.current;
    setIsSlateLoading(true);
    const query = new URLSearchParams({
      season,
      lookback: String(forecastParams.lookbackGameweeks),
      homeAdvantage: String(forecastParams.homeAdvantage),
      correlation: String(forecastParams.correlation),
      simulations: String(forecastParams.simulations),
      fplBlend: String(forecastParams.fplStrengthBlend),
    });
    if (gameweek) query.set("gameweek", String(gameweek));
    if (options?.skipSettlement) query.set("skipSettlement", "1");

    try {
      const response = await fetch(`/api/bookings?${query.toString()}`, { cache: "no-store" });
      if (!response.ok || requestId !== latestSlateRequest.current) return false;
      const payload = await response.json() as {
        bookings: BookingRecord[];
        rows?: GameweekSlateRow[];
        summary?: GameweekSlateSummary;
        availableGameweeks?: number[];
        pnlHistory?: GameweekBookedPnl[];
      };
      setBookings(payload.bookings);
      if (payload.pnlHistory) setPnlHistory(payload.pnlHistory);
      if (payload.rows && payload.summary) {
        setSlateRows(payload.rows);
        setSlateSummary(payload.summary);
      }
      if (payload.availableGameweeks) setBookingGameweeks(payload.availableGameweeks);
      return Boolean(payload.rows && payload.summary);
    } finally {
      if (requestId === latestSlateRequest.current) setIsSlateLoading(false);
    }
  }, []);

  const loadForecast = useCallback(async (nextParams: ForecastParams) => {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        lookback: String(nextParams.lookbackGameweeks),
        homeAdvantage: String(nextParams.homeAdvantage),
        correlation: String(nextParams.correlation),
        simulations: String(nextParams.simulations),
        fplBlend: String(nextParams.fplStrengthBlend),
      });

      const response = await fetch(`/api/forecast?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json() as ForecastResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load forecast.");

      if (requestId === latestRequest.current) {
        setData(payload);
        if (payload.season) {
          await loadBookings(payload.season, resolvedGameweek, nextParams);
        }
      }
    } catch (reason) {
      if (requestId === latestRequest.current) {
        setError(reason instanceof Error ? reason.message : "Unable to load forecast.");
      }
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }, [loadBookings, resolvedGameweek]);

  // Depend on each control value so formula tweaks always retrigger a fetch.
  // Debounce so slider drags coalesce into one recompute.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadForecast({
        lookbackGameweeks: params.lookbackGameweeks,
        homeAdvantage: params.homeAdvantage,
        correlation: params.correlation,
        simulations: params.simulations,
        fplStrengthBlend: params.fplStrengthBlend,
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    loadForecast,
    params.lookbackGameweeks,
    params.homeAdvantage,
    params.correlation,
    params.simulations,
    params.fplStrengthBlend,
  ]);

  const navigateSubView = useCallback((next: ForecastSubView) => {
    setSubView(next);
    if (next === "bookings" && data?.season) {
      void loadBookings(data.season, resolvedGameweek, params);
    }
  }, [data, loadBookings, params, resolvedGameweek]);

  const selectGameweek = useCallback((gameweek: number) => {
    setSelectedGameweek(gameweek);
    if (data?.season) {
      void loadBookings(data.season, gameweek, params);
    }
  }, [data, loadBookings, params]);

  const matchdayPage = useMemo(() => {
    if (!data?.season) return null;
    return buildMatchdayOnePager({
      season: data.season,
      gameweek: resolvedGameweek,
      forecasts: data.upcomingFixtures,
      bookings,
      slateRows,
    });
  }, [bookings, data, resolvedGameweek, slateRows]);

  const kellyPlan = useMemo(() => {
    const candidates = slateRows.flatMap((row) => {
      if (row.booking || row.finished || !row.modelPick || priceClosed[row.fixtureId]) return [];
      const odds = parseDecimalOdds(rowOdds[row.fixtureId] ?? defaultOdds);
      if (odds === null) return [];
      return [{ fixtureId: row.fixtureId, probability: row.modelPick.probability, odds }];
    });
    return buildKellyPlan(candidates, Number(capital));
  }, [capital, defaultOdds, priceClosed, rowOdds, slateRows]);

  const openOnePager = useCallback(() => {
    setOnePagerOpen(true);
    if (data?.season) {
      void loadBookings(data.season, resolvedGameweek, params);
    }
  }, [data, loadBookings, params, resolvedGameweek]);

  async function submitBookings(
    rows: Array<{ fixtureId: number; market: string; selection: string; stake: number; odds: number }>,
    fixtureId: number | null,
  ) {
    if (!data?.season || rows.length === 0 || bookingLock.current) return;

    bookingLock.current = true;
    setBookingFixtureId(fixtureId);
    setIsBooking(true);
    setError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookings: rows,
          lookback: params.lookbackGameweeks,
          homeAdvantage: params.homeAdvantage,
          correlation: params.correlation,
          simulations: params.simulations,
          fplBlend: params.fplStrengthBlend,
        }),
      });
      const payload = await response.json() as { error?: string; missing?: number[] };
      if (!response.ok) throw new Error(payload.error ?? "Unable to book the selection.");
      if (payload.missing && payload.missing.length > 0) {
        setError("Some matches are not in the current forecast, so they were left unbooked.");
      }
      const loaded = await loadBookings(data.season, resolvedGameweek, params, { skipSettlement: true });
      if (loaded) scrollScatterIntoView.current = true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to book the selection.");
    } finally {
      bookingLock.current = false;
      setBookingFixtureId(null);
      setIsBooking(false);
    }
  }

  async function bookGameweek() {
    if (!data?.season) return;

    if (strategy === "kelly") {
      if (!Number.isFinite(kellyPlan.capital) || kellyPlan.capital <= 0) {
        setError("Stake must be positive.");
        return;
      }
      if (kellyPlan.bets.length === 0) {
        setError("No open price has a Kelly edge.");
        return;
      }
      const rows = kellyPlan.bets.flatMap((bet) => {
        const row = slateRows.find((item) => item.fixtureId === bet.fixtureId);
        if (!row?.modelPick) return [];
        return [{
          fixtureId: row.fixtureId,
          market: row.modelPick.market,
          selection: row.modelPick.selection,
          stake: bet.stake,
          odds: bet.odds,
        }];
      });
      await submitBookings(rows, null);
      return;
    }

    const stakeValue = Number(stake);
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      setError("Stake must be positive.");
      return;
    }

    const openRows = slateRows.filter((row) => !row.booking && !row.finished && row.modelPick && !priceClosed[row.fixtureId]);
    const readyRows = pendingRowsWithOpenOdds(slateRows, rowOdds, defaultOdds, priceClosed);
    if (openRows.length === 0) {
      setError("Mark at least one match as open before booking.");
      return;
    }
    if (readyRows.length !== openRows.length) {
      setError("Decimal odds must be greater than 1.");
      return;
    }

    const rows = readyRows.map((row) => ({
      fixtureId: row.fixtureId,
      market: row.modelPick!.market,
      selection: row.modelPick!.selection,
      stake: stakeValue,
      odds: parseDecimalOdds(rowOdds[row.fixtureId] ?? defaultOdds)!,
    }));

    await submitBookings(rows, null);
  }

  async function bookFixture(fixtureId: number) {
    if (!data?.season) return;

    const row = slateRows.find((item) => item.fixtureId === fixtureId);
    const odds = parseDecimalOdds(row ? (rowOdds[row.fixtureId] ?? defaultOdds) : "");
    if (!row || row.booking || row.finished || !row.modelPick || priceClosed[fixtureId] || odds === null) {
      setError("Decimal odds must be greater than 1.");
      return;
    }

    const kellyBet = strategy === "kelly" ? kellyPlan.bets.find((bet) => bet.fixtureId === fixtureId) : null;
    if (strategy === "kelly" && !kellyBet) {
      setError("That match has no Kelly edge at these odds.");
      return;
    }
    const stakeValue = kellyBet ? kellyBet.stake : Number(stake);
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      setError("Stake must be positive.");
      return;
    }

    await submitBookings([{
      fixtureId: row.fixtureId,
      market: row.modelPick.market,
      selection: row.modelPick.selection,
      stake: stakeValue,
      odds,
    }], fixtureId);
  }

  async function resolveLiveBookings() {
    setIsResolving(true);
    setError(null);
    setResolveMessage(null);
    try {
      const response = await fetch("/api/bookings", { method: "PATCH", cache: "no-store" });
      const payload = await response.json() as {
        settled?: number;
        remaining?: number;
        persistedFixtures?: number;
        bookings?: BookingRecord[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to resolve open bookings.");

      if (data?.season) {
        await loadBookings(data.season, resolvedGameweek, params, { skipSettlement: true });
      } else if (payload.bookings) {
        setBookings(payload.bookings);
      }

      const settled = payload.settled ?? 0;
      const remaining = payload.remaining ?? 0;
      const persistedFixtures = payload.persistedFixtures ?? 0;
      if (settled === 0 && remaining > 0) {
        setResolveMessage(`No results were available yet. ${remaining} booking${remaining === 1 ? "" : "s"} still open.`);
      } else if (settled > 0) {
        setResolveMessage(
          `Settled and saved ${settled} booking${settled === 1 ? "" : "s"}`
          + (persistedFixtures > 0 ? ` and ${persistedFixtures} match result${persistedFixtures === 1 ? "" : "s"}` : "")
          + `.${remaining > 0 ? ` ${remaining} still open.` : " Results persist across reloads."}`,
        );
      } else {
        setResolveMessage("All bookings are already settled.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to resolve open bookings.");
    } finally {
      setIsResolving(false);
    }
  }

  async function clearGameweek() {
    if (!data?.season || isClearing) return;
    const bookedCount = slateRows.filter((row) => row.booking).length;
    if (bookedCount === 0) return;
    const confirmed = window.confirm(
      `Clear all Gameweek ${resolvedGameweek} bookings? This removes every bet for that week, including settled ones, so you can enter them again.`,
    );
    if (!confirmed) return;

    setIsClearing(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        season: data.season,
        gameweek: String(resolvedGameweek),
      });
      const response = await fetch(`/api/bookings?${query.toString()}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to clear this gameweek.");
      await loadBookings(data.season, resolvedGameweek, params, { skipSettlement: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to clear this gameweek.");
    } finally {
      setIsClearing(false);
    }
  }

  useEffect(() => {
    if (!scrollScatterIntoView.current || isBooking || isSlateLoading) return;
    scrollScatterIntoView.current = false;
    if (!slateRows.some((row) => row.booking && row.booking.odds > 1)) return;
    scatterRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isBooking, isSlateLoading, slateRows]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        Running fixture simulations…
      </div>
    );
  }

  if (!data?.season) {
    return (
      <div className="py-12 text-center">
        <p className="font-medium">No FPL data has been hydrated yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Run <code className="rounded bg-muted px-1.5 py-0.5">pnpm hydrate</code> to load fixtures and team ratings.
        </p>
      </div>
    );
  }

  return (
    <section className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[285px_1fr]">
      <ModelControls params={params} isRecomputing={isLoading} onChange={setParams} />

      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SubViewNav
              activeView={subView}
              onNavigate={navigateSubView}
            />
            {(subView === "fixtures" || subView === "bookings") && (subView === "bookings" ? bookingGameweeks : fixtureGameweeks).length > 0 ? (
              <GameweekSelect
                gameweeks={subView === "bookings" ? bookingGameweeks : fixtureGameweeks}
                value={resolvedGameweek}
                onChange={selectGameweek}
              />
            ) : null}
            {(subView === "fixtures" || subView === "bookings") ? (
              <Button type="button" variant="outline" onClick={openOnePager}>
                <FileText />
                Matchday one-pager
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {data.season} · {subView === "strengths"
              ? `completed through GW${data.currentGameweek ?? "?"}`
              : subView === "bookings"
                ? `GW${resolvedGameweek} · book slate`
                : slateReady && realizedRows.length > 0 && gameweekFixtures.length === 0
                  ? `GW${resolvedGameweek} · played${slateSummary.settledCount > 0 ? ` · ${formatPnl(slateSummary.settledPnl)}` : ""}`
                  : slateReady
                    ? `GW${resolvedGameweek} · ${slateSummary.settledCount} settled · ${slateSummary.openCount} open`
                    : `GW${resolvedGameweek}`}
            {isLoading ? " · recomputing…" : ""}
          </p>
        </div>

        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

        {subView === "bookings" ? (
          <div className="grid gap-5">
            {slateRows.length === 0 ? (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <p className="font-medium">No fixtures for Gameweek {resolvedGameweek}</p>
                <p className="mt-2 text-sm text-muted-foreground">Choose another gameweek from the list.</p>
              </div>
            ) : (
              <GameweekBookingsView
                summary={slateSummary}
                scatterRef={scatterRef}
                gameweek={resolvedGameweek}
                rows={slateRows}
                stake={stake}
                defaultOdds={defaultOdds}
                rowOdds={rowOdds}
                isBooking={isBooking}
                isClearing={isClearing}
                onStakeChange={setStake}
                onDefaultOddsChange={(value) => {
                  setDefaultOdds(value);
                  setRowOdds({});
                }}
                onRowOddsChange={(fixtureId, value) => setRowOdds((current) => ({ ...current, [fixtureId]: value }))}
                onBookAll={() => void bookGameweek()}
                onBookRow={(fixtureId) => void bookFixture(fixtureId)}
                bookingFixtureId={bookingFixtureId}
                priceClosed={priceClosed}
                onPriceOpenChange={(fixtureId, open) => {
                  setPriceClosed((current) => ({ ...current, [fixtureId]: !open }));
                }}
                strategy={strategy}
                capital={capital}
                onStrategyChange={setStrategy}
                onCapitalChange={setCapital}
                kellyBets={kellyPlan.bets}
                kellyPassed={kellyPlan.passed}
                kellyScaled={kellyPlan.scaled}
                onClear={() => void clearGameweek()}
                canResolve={slateSummary.openCount > 0 || bookings.some((booking) => booking.status === "open")}
                isResolving={isResolving}
                resolveMessage={resolveMessage}
                onResolve={() => void resolveLiveBookings()}
              />
            )}
          </div>
        ) : subView === "strengths" ? (
          <TeamStrengthsPanel data={data} />
        ) : gameweekFixtures.length === 0 && realizedRows.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {realizedRows.map((row) => (
              <RealizedMatchCard key={row.fixtureId} row={row} />
            ))}
          </div>
        ) : gameweekFixtures.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center">
            <p className="font-medium">
              {isSlateLoading ? `Loading Gameweek ${resolvedGameweek}…` : `No fixtures for Gameweek ${resolvedGameweek}`}
            </p>
            {isSlateLoading ? null : (
              <p className="mt-2 text-sm text-muted-foreground">Choose another gameweek from the list.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {gameweekFixtures.map((fixture) => (
              <FixtureForecastCard
                key={fixture.fixtureId}
                fixture={fixture}
                booked={openBookingsByFixture.has(fixture.fixtureId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
      <BookedPnlStrip entries={pnlHistory} />
      {onePagerOpen && matchdayPage ? (
        <MatchdayOnePager
          page={matchdayPage}
          pnlHistory={pnlHistory}
          onClose={() => setOnePagerOpen(false)}
        />
      ) : null}
    </section>
  );
}
