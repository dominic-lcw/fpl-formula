"use client";

import { Calculator, LoaderCircle, Plus, Target, Trash2, TrendingUp } from "lucide-react";
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
  forecast?: FixtureForecast | null;
};

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

export function MatchForecastPanel() {
  const [params, setParams] = useState<ForecastParams>(DEFAULT_FORECAST_PARAMS);
  const [data, setData] = useState<ForecastResponse | null>(null);
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

  const selectionChoices = useMemo(
    () => selectionOptions(market, selectedFixture),
    [market, selectedFixture],
  );

  const activeSelection = selectionChoices.some((option) => option.value === selection)
    ? selection
    : (selectionChoices[0]?.value ?? "");

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
        setSelectedFixtureId((current) => current ?? payload.upcomingFixtures[0]?.fixtureId ?? null);
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

  async function saveBet() {
    if (!selectedFixture || !data?.season) return;
    setIsSavingBet(true);
    setError(null);
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
        Building team strengths and simulations…
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
    <section className="grid gap-5 xl:grid-cols-[285px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-4 text-muted-foreground" />
            Model controls
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Attack and defence ratings are derived from recent results, blended with official FPL strength numbers.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ParameterSlider
            label="Lookback (GWs)"
            value={params.lookbackGameweeks}
            min={3}
            max={20}
            onChange={(value) => setParams((current) => ({ ...current, lookbackGameweeks: value }))}
          />
          <ParameterSlider
            label="Home advantage"
            value={params.homeAdvantage}
            min={1}
            max={1.35}
            step={0.01}
            onChange={(value) => setParams((current) => ({ ...current, homeAdvantage: value }))}
          />
          <ParameterSlider
            label="Bivariate correlation (λ₃)"
            value={params.correlation}
            min={0}
            max={0.25}
            step={0.01}
            onChange={(value) => setParams((current) => ({ ...current, correlation: value }))}
          />
          <ParameterSlider
            label="FPL strength blend"
            value={params.fplStrengthBlend}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) => setParams((current) => ({ ...current, fplStrengthBlend: value }))}
          />
          <ParameterSlider
            label="Monte Carlo runs"
            value={params.simulations}
            min={1000}
            max={25000}
            step={1000}
            onChange={(value) => setParams((current) => ({ ...current, simulations: value }))}
          />
          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            <p className="font-medium text-foreground">Formula</p>
            <p className="mt-1">
              λ<sub>home</sub> = league avg × attack<sub>home</sub> × defence<sub>away</sub> × home advantage
            </p>
            <p>
              λ<sub>away</sub> = league avg × attack<sub>away</sub> × defence<sub>home</sub>
            </p>
            <p className="mt-1">
              Bivariate Poisson: goals = independent Poisson + shared λ₃ component for low-score correlation.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5">
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

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
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming fixtures</CardTitle>
            </CardHeader>
            <CardContent className="grid max-h-[420px] gap-2 overflow-y-auto">
              {data.upcomingFixtures.map((fixture) => (
                <button
                  key={fixture.fixtureId}
                  type="button"
                  onClick={() => setSelectedFixtureId(fixture.fixtureId)}
                  className={`rounded-lg border px-3 py-2 text-left transition hover:border-primary/40 ${
                    selectedFixtureId === fixture.fixtureId ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="text-sm font-medium">
                    {fixture.homeShortName} vs {fixture.awayShortName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    GW{fixture.event ?? "?"} · expected {fixture.expectedHomeGoals.toFixed(2)}–{fixture.expectedAwayGoals.toFixed(2)}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedFixture ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="size-4 text-muted-foreground" />
                  {selectedFixture.homeTeam} vs {selectedFixture.awayTeam}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Monte Carlo forecast from {params.simulations.toLocaleString()} bivariate Poisson simulations
                </p>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Expected score</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {selectedFixture.expectedHomeGoals.toFixed(2)} – {selectedFixture.expectedAwayGoals.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">1X2</p>
                    <p className="mt-1 text-sm">
                      H {formatPercent(selectedFixture.homeWinProb)} · D {formatPercent(selectedFixture.drawProb)} · A {formatPercent(selectedFixture.awayWinProb)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Markets</p>
                    <p className="mt-1 text-sm">
                      O2.5 {formatPercent(selectedFixture.over25Prob)} · BTTS {formatPercent(selectedFixture.bttsProb)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Most likely scorelines</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedFixture.topScorelines.map((line) => (
                      <Badge key={`${line.home}-${line.away}`}>
                        {line.home}-{line.away} · {formatPercent(line.prob)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 border-t pt-4">
                  <p className="text-sm font-medium">Log a bet</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      Market
                      <select
                        value={market}
                        onChange={(event) => {
                          const nextMarket = event.target.value as BetMarket;
                          setMarket(nextMarket);
                          const nextOptions = selectionOptions(nextMarket, selectedFixture);
                          setSelection(nextOptions[0]?.value ?? "");
                        }}
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
                        onChange={(event) => setSelection(event.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {selectionChoices.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Stake (£)
                      <Input value={stake} onChange={(event) => setStake(event.target.value)} inputMode="decimal" />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Odds (decimal)
                      <Input value={odds} onChange={(event) => setOdds(event.target.value)} inputMode="decimal" />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm">
                    Notes
                    <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional bookmaker or rationale" />
                  </label>
                  <button
                    type="button"
                    disabled={isSavingBet}
                    onClick={() => void saveBet()}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSavingBet ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Save bet
                  </button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Saved bets</CardTitle>
            <p className="text-sm text-muted-foreground">Stored in DuckDB (`bets.parquet`) with model probability and expected value at placement.</p>
          </CardHeader>
          <CardContent>
            {bets.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No bets logged yet for this season.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Fixture</th>
                      <th className="py-2 pr-3">Market</th>
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
                          <p className="font-medium">{bet.homeTeam} vs {bet.awayTeam}</p>
                          <p className="text-xs text-muted-foreground">{bet.selection}</p>
                        </td>
                        <td className="py-2 pr-3">{bet.market}</td>
                        <td className="py-2 pr-3">£{bet.stake.toFixed(2)}</td>
                        <td className="py-2 pr-3">{bet.odds.toFixed(2)}</td>
                        <td className="py-2 pr-3">{formatPercent(bet.modelProb)}</td>
                        <td className={`py-2 pr-3 ${bet.expectedValue >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {formatEv(bet.expectedValue)}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void removeBet(bet.id)}
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
      </div>
    </section>
  );
}
