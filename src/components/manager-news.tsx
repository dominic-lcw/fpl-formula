"use client";

import { ChevronDown, ExternalLink, LoaderCircle, Newspaper, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ManagerPressItem, ManagerWordsSource } from "@/lib/manager-words/types";

type ManagerWordsResponse = {
  season: string;
  fetchedAt: string;
  sources: {
    rssArticles: number;
    livePages: number;
    liveUpdates: number;
  };
  count: number;
  availableGameweeks: number[];
  availableTeams: string[];
  items: ManagerPressItem[];
};

function sourceLabel(source: ManagerWordsSource) {
  switch (source) {
    case "bbc_live":
      return "BBC live";
    case "bbc_team_rss":
      return "BBC club RSS";
    default:
      return "BBC PL RSS";
  }
}

function formatPublishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFetchedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ManagerNewsPanel() {
  const [data, setData] = useState<ManagerWordsResponse | null>(null);
  const [gameweek, setGameweek] = useState<string>("ALL");
  const [team, setTeam] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/manager-words", { cache: "no-store" });
      const payload = await response.json() as ManagerWordsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load manager news.");
      }
      setData(payload);
    } catch (reason) {
      setData(null);
      setError(reason instanceof Error ? reason.message : "Unable to load manager news.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadNews();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadNews]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item) => {
      if (gameweek !== "ALL" && item.gameweek !== Number(gameweek)) return false;
      if (team !== "ALL" && item.teamName !== team) return false;
      return true;
    });
  }, [data, gameweek, team]);

  const groupedByGameweek = useMemo(() => {
    const groups = new Map<number | "unknown", ManagerPressItem[]>();
    for (const item of filteredItems) {
      const key = item.gameweek ?? "unknown";
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }

    return [...groups.entries()].sort(([left], [right]) => {
      if (left === "unknown") return 1;
      if (right === "unknown") return -1;
      return right - left;
    });
  }, [filteredItems]);

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Newspaper size={18} className="text-muted-foreground" />
              Manager press feed
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Pre-match manager quotes from BBC Sport, grouped by gameweek. Use the filters to review data quality before we build anything on top of it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadNews()}
            disabled={isLoading}
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Refresh
          </button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <label className="relative">
              <span className="sr-only">Gameweek</span>
              <select
                value={gameweek}
                onChange={(event) => setGameweek(event.target.value)}
                className="h-9 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">All gameweeks</option>
                {(data?.availableGameweeks ?? []).map((option) => (
                  <option key={option} value={option}>
                    Gameweek {option}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted-foreground" size={15} />
            </label>
            <label className="relative">
              <span className="sr-only">Club</span>
              <select
                value={team}
                onChange={(event) => setTeam(event.target.value)}
                className="h-9 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">All clubs</option>
                {(data?.availableTeams ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted-foreground" size={15} />
            </label>
          </div>

          {data ? (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge className="border-border bg-background">{data.season}</Badge>
              <Badge className="border-border bg-background">{filteredItems.length} shown</Badge>
              <Badge className="border-border bg-background">Fetched {formatFetchedAt(data.fetchedAt)}</Badge>
              <Badge className="border-border bg-background">{data.sources.rssArticles} RSS</Badge>
              {data.sources.liveUpdates > 0 ? (
                <Badge className="border-border bg-background">{data.sources.liveUpdates} live updates</Badge>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isLoading && !data ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <LoaderCircle className="mx-auto mb-3 animate-spin" size={24} />
            Loading manager press feed…
          </CardContent>
        </Card>
      ) : error && !data ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-medium text-destructive">{error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Run <code className="rounded bg-muted px-1.5 py-0.5">pnpm fetch:manager-words</code> to build the dataset, then refresh this page.
            </p>
          </CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No manager quotes match these filters.
          </CardContent>
        </Card>
      ) : (
        groupedByGameweek.map(([groupGameweek, items]) => (
          <div key={String(groupGameweek)} className="grid gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {groupGameweek === "unknown" ? "Unmapped gameweek" : `Gameweek ${groupGameweek}`}
              <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/80">
                ({items.length})
              </span>
            </h2>
            <div className="grid gap-3">
              {items.map((item) => (
                <Card key={item.id}>
                  <CardContent className="grid gap-3 pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.teamName ?? "Unknown club"}</p>
                          {item.managerName ? (
                            <span className="text-sm text-muted-foreground">· {item.managerName}</span>
                          ) : null}
                        </div>
                        <p className="text-base font-medium leading-snug">{item.headline}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.gameweek ? <Badge>GW{item.gameweek}</Badge> : null}
                        <Badge className="bg-background">{sourceLabel(item.source)}</Badge>
                      </div>
                    </div>
                    <blockquote className="border-l-2 border-primary/30 pl-4 text-sm leading-6 text-muted-foreground">
                      {item.quote}
                    </blockquote>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{formatPublishedAt(item.publishedAt)}</span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        Source
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
