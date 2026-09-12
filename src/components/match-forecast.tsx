"use client";

import {
  ArrowLeft,
  Calculator,
  ChevronRight,
  LoaderCircle,
  Plus,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BetMarket, BetRecord } from "@/lib/bets";
import type { FixtureForecast, ForecastParams, TeamStrength } from "@/lib/match-forecast-model";
import { DEFAULT_FORECAST_PARAMS } from "@/lib/match-forecast-model";

type ForecastResponse = {
  season: string | null;
  currentGameweek: number | null;
  leagueAverageGoals: number | null;
  homeAdvantage: number;
  teamStrengths: TeamStrength[];
  upcomingFixtures: FixtureForecast[];
};

type ForecastSubView = "fixtures" | "strengths" | "detail";

const marketOptions: Array<{ value: BetMarket; label: string }> = [
  { value: "1X2", label: "Match result (1X2)" },
  { value: "over_under", label: "Over / under 2.5" },
  { value: "btts", label: "Both teams to score" },
  { value: "correct_score", label: "Correct score" },
];

function selectionOptions(market: BetMarket, forecast: FixtureForecast | null) {
  switch (market) {
    case "1X2":
      return [
        { value: "home", label: `${forecast?.homeShortName ?? "Home"} win` },
        { value: "draw", label: "Draw" },
        { value: "away", label: `${forecast?.awayShortName ?? "Away"} win` },
      ];
    case "over_under":
      return [
        { value: "over_2.5", label: "Over 2.5 goals" },
        { value: "under_2.5", label: "Under 2.5 goals" },
      ];
    case "btts":
      return [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ];
    case "correct_score":
      return (forecast?.topScorelines ?? []).map((line) => ({
        value: `${line.home}-${line.away}`,
        label: `${line.home}-${line.away} (${(line.prob * 100).toFixed(1)}%)`,
      }));
    default:
      return [];
  }
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatEv(value: number) {
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
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

function SubViewNav({
  activeView,
  onNavigate,
}: {
  activeView: Exclude<ForecastSubView, "detail">;
  onNavigate: (view: Exclude<ForecastSubView, "detail">) => void;
}) {
  const tabs: Array<{ id: Exclude<ForecastSubView, "detail">; label: string; icon: typeof Target }> = [
    { id: "fixtures", label: "Fixtures", icon: Target },
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

function FixtureForecastCard({
  fixture,
  betCount,
  onSelect,
}: {
  fixture: FixtureForecast;
  betCount: number;
  onSelect: () => void;
}) {
  const winner = predictedWinner(fixture);
  const scoreline = mostLikelyScoreline(fixture);
  const kickoff = formatKickoff(fixture.kickoffTime);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 text-left shadow-xs transition hover:border-primary/40 hover:bg-accent/20"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            GW{fixture.event ?? "?"}{kickoff ? ` · ${kickoff}` : ""}
          </p>
        </div>
        {betCount > 0 ? (
          <Badge className="bg-primary/10 text-primary">{betCount} bet{betCount === 1 ? "" : "s"}</Badge>
        ) : null}
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

      <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <span>Expected {fixture.expectedHomeGoals.toFixed(2)}–{fixture.expectedAwayGoals.toFixed(2)}</span>
        <span className="inline-flex items-center gap-1 font-medium text-primary opacity-0 transition group-hover:opacity-100">
          View bets <ChevronRight className="size-3.5" />
        </span>
      </div>
    </button>
  );
}

function ModelControls({
  params,
  onChange,
}: {
  params: ForecastParams;
  onChange: (params: ForecastParams) => void;
}) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4 text-muted-foreground" />
          Model controls
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ParameterSlider
          label="Lookback (GWs)"
          value={params.lookbackGameweeks}
          min={3}
          max={20}
          onChange={(value) => onChange({ ...params, lookbackGameweeks: value })}
        />
        <ParameterSlider
          label="Home advantage"
          value={params.homeAdvantage}
          min={1}
          max={1.35}
          step={0.01}
          onChange={(value) => onChange({ ...params, homeAdvantage: value })}
        />
        <ParameterSlider
          label="Bivariate correlation (λ₃)"
          value={params.correlation}
          min={0}
          max={0.25}
          step={0.01}
          onChange={(value) => onChange({ ...params, correlation: value })}
        />
        <ParameterSlider
          label="FPL strength blend"
          value={params.fplStrengthBlend}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => onChange({ ...params, fplStrengthBlend: value })}
        />
        <ParameterSlider
          label="Monte Carlo runs"
          value={params.simulations}
          min={1000}
          max={25000}
          step={1000}
          onChange={(value) => onChange({ ...params, simulations: value })}
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
        </div>
      </CardContent>
    </Card>
  );
}

function FixtureBetDetail({
  fixture,
  params,
  bets,
  market,
  selection,
  stake,
  odds,
  notes,
  isSavingBet,
  onMarketChange,
  onSelectionChange,
  onStakeChange,
  onOddsChange,
  onNotesChange,
  onSaveBet,
  onRemoveBet,
}: {
  fixture: FixtureForecast;
  params: ForecastParams;
  bets: BetRecord[];
  market: BetMarket;
  selection: string;
  stake: string;
  odds: string;
  notes: string;
  isSavingBet: boolean;
  onMarketChange: (market: BetMarket) => void;
  onSelectionChange: (selection: string) => void;
  onStakeChange: (stake: string) => void;
  onOddsChange: (odds: string) => void;
  onNotesChange: (notes: string) => void;
  onSaveBet: () => void;
  onRemoveBet: (id: string) => void;
}) {
  const winner = predictedWinner(fixture);
  const scoreline = mostLikelyScoreline(fixture);
  const selectionChoices = selectionOptions(market, fixture);
  const activeSelection = selectionChoices.some((option) => option.value === selection)
    ? selection
    : (selectionChoices[0]?.value ?? "");

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Predicted winner</p>
          <p className="mt-2 text-xl font-semibold">{winner.label}</p>
          <p className="text-sm text-muted-foreground">{formatPercent(winner.prob)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Most likely score</p>
          <p className="mt-2 text-xl font-semibold">{scoreline ? `${scoreline.home}-${scoreline.away}` : "—"}</p>
          <p className="text-sm text-muted-foreground">{scoreline ? formatPercent(scoreline.prob) : ""}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Expected score</p>
          <p className="mt-2 text-xl font-semibold">
            {fixture.expectedHomeGoals.toFixed(2)} – {fixture.expectedAwayGoals.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Other markets</p>
          <p className="mt-2 text-sm">
            O2.5 {formatPercent(fixture.over25Prob)} · BTTS {formatPercent(fixture.bttsProb)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            H/D/A {formatPercent(fixture.homeWinProb)}/{formatPercent(fixture.drawProb)}/{formatPercent(fixture.awayWinProb)}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scoreline distribution</CardTitle>
          <p className="text-sm text-muted-foreground">
            From {params.simulations.toLocaleString()} bivariate Poisson simulations
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {fixture.topScorelines.map((line) => (
              <Badge key={`${line.home}-${line.away}`}>
                {line.home}-{line.away} · {formatPercent(line.prob)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Saved bets for this fixture</CardTitle>
          </CardHeader>
          <CardContent>
            {bets.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No bets logged for this match yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Selection</th>
                      <th className="py-2 pr-3">Stake</th>
                      <th className="py-2 pr-3">Odds</th>
                      <th className="py-2 pr-3">Model prob</th>
                      <th className="py-2 pr-3">EV</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {bets.map((bet) => (
                      <tr key={bet.id} className="border-b border-border/60">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{bet.market}</p>
                          <p className="text-xs text-muted-foreground">{bet.selection}</p>
                        </td>
                        <td className="py-2 pr-3">£{bet.stake.toFixed(2)}</td>
                        <td className="py-2 pr-3">{bet.odds.toFixed(2)}</td>
                        <td className="py-2 pr-3">{formatPercent(bet.modelProb)}</td>
                        <td className={`py-2 pr-3 ${bet.expectedValue >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {formatEv(bet.expectedValue)}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => onRemoveBet(bet.id)}
                            className="inline-flex size-8 items-center justify-center rounded-md border border-input hover:bg-accent"
                            aria-label="Delete bet"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Log a bet</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="grid gap-1 text-sm">
              Market
              <select
                value={market}
                onChange={(event) => onMarketChange(event.target.value as BetMarket)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {marketOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Selection
              <select
                value={activeSelection}
                onChange={(event) => onSelectionChange(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {selectionChoices.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Stake (£)
              <Input value={stake} onChange={(event) => onStakeChange(event.target.value)} inputMode="decimal" />
            </label>
            <label className="grid gap-1 text-sm">
              Odds (decimal)
              <Input value={odds} onChange={(event) => onOddsChange(event.target.value)} inputMode="decimal" />
            </label>
            <label className="grid gap-1 text-sm">
              Notes
              <Input value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional bookmaker or rationale" />
            </label>
            <button
              type="button"
              disabled={isSavingBet}
              onClick={onSaveBet}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isSavingBet ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save bet
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function MatchForecastPanel() {
  const [params, setParams] = useState<ForecastParams>(DEFAULT_FORECAST_PARAMS);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [subView, setSubView] = useState<ForecastSubView>("fixtures");
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [bets, setBets] = useState<BetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingBet, setIsSavingBet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<BetMarket>("1X2");
  const [selection, setSelection] = useState("home");
  const [stake, setStake] = useState("10");
  const [odds, setOdds] = useState("2.10");
  const [notes, setNotes] = useState("");
  const latestRequest = useRef(0);

  const selectedFixture = useMemo(
    () => data?.upcomingFixtures.find((fixture) => fixture.fixtureId === selectedFixtureId) ?? null,
    [data?.upcomingFixtures, selectedFixtureId],
  );

  const betsByFixture = useMemo(() => {
    const map = new Map<number, BetRecord[]>();
    for (const bet of bets) {
      const existing = map.get(bet.fixtureId) ?? [];
      existing.push(bet);
      map.set(bet.fixtureId, existing);
    }
    return map;
  }, [bets]);

  const fixtureBets = selectedFixtureId ? (betsByFixture.get(selectedFixtureId) ?? []) : [];

  const loadBets = useCallback(async (season?: string | null) => {
    const query = season ? `?season=${encodeURIComponent(season)}` : "";
    const response = await fetch(`/api/bets${query}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { bets: BetRecord[] };
    setBets(payload.bets);
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
        if (payload.season) await loadBets(payload.season);
      }
    } catch (reason) {
      if (requestId === latestRequest.current) {
        setError(reason instanceof Error ? reason.message : "Unable to load forecast.");
      }
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }, [loadBets]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadForecast(params);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadForecast, params]);

  function openFixtureDetail(fixtureId: number) {
    setSelectedFixtureId(fixtureId);
    setSubView("detail");
    setMarket("1X2");
    setSelection("home");
    setNotes("");
  }

  function goBackToFixtures() {
    setSubView("fixtures");
    setSelectedFixtureId(null);
  }

  async function saveBet() {
    if (!selectedFixture || !data?.season) return;
    setIsSavingBet(true);
    setError(null);

    const selectionChoices = selectionOptions(market, selectedFixture);
    const activeSelection = selectionChoices.some((option) => option.value === selection)
      ? selection
      : (selectionChoices[0]?.value ?? "");

    try {
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: selectedFixture.fixtureId,
          season: data.season,
          homeTeam: selectedFixture.homeTeam,
          awayTeam: selectedFixture.awayTeam,
          market,
          selection: activeSelection,
          stake: Number(stake),
          odds: Number(odds),
          notes: notes.trim() || undefined,
        }),
      });
      const payload = await response.json() as { bet?: BetRecord; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save bet.");
      setNotes("");
      await loadBets(data.season);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save bet.");
    } finally {
      setIsSavingBet(false);
    }
  }

  async function removeBet(id: string) {
    const response = await fetch(`/api/bets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return;
    if (data?.season) await loadBets(data.season);
  }

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

  if (subView === "detail" && selectedFixture) {
    return (
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={goBackToFixtures}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            All fixtures
          </button>
          <div>
            <h2 className="text-lg font-semibold">{selectedFixture.homeTeam} vs {selectedFixture.awayTeam}</h2>
            <p className="text-sm text-muted-foreground">
              GW{selectedFixture.event ?? "?"}{selectedFixture.kickoffTime ? ` · ${formatKickoff(selectedFixture.kickoffTime)}` : ""}
            </p>
          </div>
        </div>

        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

        <FixtureBetDetail
          fixture={selectedFixture}
          params={params}
          bets={fixtureBets}
          market={market}
          selection={selection}
          stake={stake}
          odds={odds}
          notes={notes}
          isSavingBet={isSavingBet}
          onMarketChange={(nextMarket) => {
            setMarket(nextMarket);
            const nextOptions = selectionOptions(nextMarket, selectedFixture);
            setSelection(nextOptions[0]?.value ?? "");
          }}
          onSelectionChange={setSelection}
          onStakeChange={setStake}
          onOddsChange={setOdds}
          onNotesChange={setNotes}
          onSaveBet={() => void saveBet()}
          onRemoveBet={(id) => void removeBet(id)}
        />
      </div>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[285px_1fr]">
      <ModelControls params={params} onChange={setParams} />

      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SubViewNav
            activeView={subView === "strengths" ? "strengths" : "fixtures"}
            onNavigate={setSubView}
          />
          <p className="text-sm text-muted-foreground">
            {data.season} · GW{data.currentGameweek ?? "?"} · {data.upcomingFixtures.length} upcoming fixtures
          </p>
        </div>

        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

        {subView === "strengths" ? (
          <TeamStrengthsPanel data={data} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.upcomingFixtures.map((fixture) => (
              <FixtureForecastCard
                key={fixture.fixtureId}
                fixture={fixture}
                betCount={betsByFixture.get(fixture.fixtureId)?.length ?? 0}
                onSelect={() => openFixtureDetail(fixture.fixtureId)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
