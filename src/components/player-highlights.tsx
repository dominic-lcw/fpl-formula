"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PlayerHighlight,
  PlayerHighlightResponse,
  PlayerHighlightsResponse,
} from "@/lib/player-highlights";
import { scoreTone } from "@/lib/score-style";

const trendCopy = {
  rising: { label: "Rising", Icon: TrendingUp, className: "text-emerald-700 dark:text-emerald-300" },
  steady: { label: "Steady", Icon: Minus, className: "text-muted-foreground" },
  falling: { label: "Cooling", Icon: TrendingDown, className: "text-rose-700 dark:text-rose-300" },
} as const;

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`;
}

function TrendBars({ player, gameweeks }: { player: PlayerHighlight; gameweeks: number[] }) {
  const maximum = Math.max(...player.recentPoints, 1);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>FPL points by GW</span>
        <span>Latest vs prior average</span>
      </div>
      <div
        aria-label={`${player.name} FPL points: ${player.recentPoints.map((points, index) => `GW${gameweeks[index]} ${points}`).join(", ")}`}
        className="flex h-20 items-end gap-2"
        role="img"
      >
        {player.recentPoints.map((points, index) => (
          <div key={gameweeks[index]} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-xs font-medium tabular-nums">{points}</span>
            <div
              aria-hidden="true"
              className="w-full min-h-1 rounded-sm bg-primary/75"
              style={{ height: `${Math.max((points / maximum) * 48, 4)}px` }}
            />
            <span className="text-[10px] text-muted-foreground">GW{gameweeks[index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightCard({ player, gameweeks }: { player: PlayerHighlight; gameweeks: number[] }) {
  const { Icon, label, className } = trendCopy[player.trend];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">#{player.rank} overall · {player.position}</p>
            <CardTitle className="mt-1 text-lg">{player.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{player.teamShortName} · {player.formPoints.toFixed(0)} pts in form window</p>
          </div>
          <span className="score-badge" data-tone={scoreTone(player.score)}>{player.score.toFixed(1)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className={`flex items-center gap-1.5 text-sm font-medium ${className}`}>
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
          <span className="text-muted-foreground">· {formatDelta(player.trendDelta)}</span>
        </div>
        <TrendBars player={player} gameweeks={gameweeks} />
        <div className="mt-5 border-t pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Next fixtures</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {player.fixtures.slice(0, 3).map((fixture, index) => (
              <span key={`${fixture.event}-${fixture.opponent}-${index}`} className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                {fixture.opponent} {fixture.wasHome ? "H" : "A"}
              </span>
            ))}
            {!player.fixtures.length && <span className="text-sm text-muted-foreground">No upcoming fixtures</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlayerHighlights() {
  const [data, setData] = useState<PlayerHighlightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHighlights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/highlights", { cache: "no-store" });
      const payload = (await response.json()) as PlayerHighlightsResponse | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Unable to load player highlights.");
      }
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load player highlights.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHighlights();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHighlights]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-8">
      <header className="flex flex-col justify-between gap-5 border-b pb-8 md:flex-row md:items-end">
        <div>
          <Link href="/" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft size={16} /> Ranking lab
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Player highlights</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            The strongest formula picks, with their last five completed Gameweeks at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.season && <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm"><p className="text-muted-foreground">Dataset</p><p className="mt-1 font-medium">{data.season} · after GW{data.currentGameweek}</p></div>}
          <button
            type="button"
            onClick={() => void loadHighlights()}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <ThemeToggle />
        </div>
      </header>

      <section className="py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">MVP watchlist</p>
            <h2 className="mt-1 text-xl font-semibold">Top players and their current direction</h2>
          </div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">Explore all rankings <ArrowRight size={15} /></Link>
        </div>

        {isLoading ? <p className="py-16 text-center text-muted-foreground">Preparing player highlights…</p> : error ? (
          <div className="py-16 text-center"><p className="text-destructive">{error}</p><button type="button" onClick={() => void loadHighlights()} className="mt-4 text-sm font-medium underline underline-offset-4">Try again</button></div>
        ) : !data?.highlights.length ? (
          <div className="py-16 text-center"><p className="font-medium">No completed Gameweek data is available yet.</p><p className="mt-2 text-sm text-muted-foreground">Run the FPL hydration job, then refresh this page.</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.highlights.map((player) => (
              <Link
                key={player.playerId}
                href={`/highlights/${player.playerId}`}
                className="block rounded-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HighlightCard player={player} gameweeks={data.gameweeks} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export function PlayerHighlightDetail({ playerId }: { playerId: number }) {
  const [data, setData] = useState<PlayerHighlightResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHighlight = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/highlights/${playerId}`, { cache: "no-store" });
      const payload = (await response.json()) as PlayerHighlightResponse | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Unable to load this player highlight.");
      }
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load this player highlight.");
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHighlight();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHighlight]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-8">
      <header className="flex flex-col justify-between gap-5 border-b pb-8 md:flex-row md:items-end">
        <div>
          <Link href="/highlights" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft size={16} /> All highlights
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {data?.highlight?.name ?? "Player highlight"}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Recent completed-Gameweek points and the current formula outlook.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.season && <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm"><p className="text-muted-foreground">Dataset</p><p className="mt-1 font-medium">{data.season} · after GW{data.currentGameweek}</p></div>}
          <button
            type="button"
            onClick={() => void loadHighlight()}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <ThemeToggle />
        </div>
      </header>

      <section className="py-8">
        {isLoading ? <p className="py-16 text-center text-muted-foreground">Preparing player highlight…</p> : error ? (
          <div className="py-16 text-center"><p className="text-destructive">{error}</p><button type="button" onClick={() => void loadHighlight()} className="mt-4 text-sm font-medium underline underline-offset-4">Try again</button></div>
        ) : !data?.highlight ? (
          <div className="py-16 text-center"><p className="font-medium">This player is not available in the current ranking.</p><Link href="/" className="mt-4 inline-flex text-sm font-medium underline underline-offset-4">Return to rankings</Link></div>
        ) : (
          <HighlightCard player={data.highlight} gameweeks={data.gameweeks} />
        )}
      </section>
    </main>
  );
}
