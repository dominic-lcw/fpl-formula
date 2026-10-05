"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useRef, type Ref } from "react";
import { createPortal } from "react-dom";
import type { SettledBookedPnl } from "@/lib/booked-pnl";
import type { MatchdayOnePager as MatchdayOnePagerData, OnePagerMatch } from "@/lib/matchday-one-pager";
import { describeSelection } from "@/lib/matchday-one-pager";

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPnl(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatEdge(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
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

function pnlClass(value: number) {
  return value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
}

export function BookedPnlStrip({ entries }: { entries: SettledBookedPnl[] }) {
  const book = entries.at(-1)?.runningPnl ?? 0;

  return (
    <section aria-label="Previous booked PnL" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Previous booked PnL</h2>
        <p className="text-xs text-muted-foreground">
          {entries.length === 0
            ? "Starts at the first settled booking"
            : `${entries.length} settled · book ${formatPnl(book)}`}
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No settled bookings yet. Open bets stay off this strip until they have a result.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="w-36 shrink-0 rounded-lg border bg-muted/20 px-3 py-2"
              aria-label={`GW${entry.gameweek ?? "?"} ${entry.homeShortName} versus ${entry.awayShortName}, ${formatPnl(entry.pnl)}`}
            >
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                GW{entry.gameweek ?? "?"} · {entry.homeShortName}–{entry.awayShortName}
              </p>
              <p className={`mt-1 text-base font-semibold tabular-nums ${pnlClass(entry.pnl)}`}>{formatPnl(entry.pnl)}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {describeSelection(entry.market, entry.selection, entry.homeShortName, entry.awayShortName)} @ {entry.odds.toFixed(2)}
              </p>
              <p className={`text-[11px] tabular-nums ${pnlClass(entry.runningPnl)}`}>Book {formatPnl(entry.runningPnl)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MatchSheet({ match }: { match: OnePagerMatch }) {
  const kickoff = formatKickoff(match.kickoffTime);
  const forecast = match.forecast;
  const odds = match.bookedOdds;
  const score = odds && odds.homeScore !== null && odds.awayScore !== null
    ? `${odds.homeScore}–${odds.awayScore}`
    : null;

  return (
    <article className="flex flex-col rounded-lg border p-3">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{match.homeShortName} vs {match.awayShortName}</h3>
          <p className="text-[11px] text-muted-foreground">{match.homeTeam} · {match.awayTeam}</p>
        </div>
        {kickoff ? <p className="text-[11px] text-muted-foreground">{kickoff}</p> : null}
      </header>

      <div className="grid gap-2 text-sm">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Forecast{forecast?.source === "booked" ? " when booked" : ""}
          </p>
          {forecast ? (
            <div className="mt-1 grid gap-0.5">
              <p className="font-medium">
                {forecast.predictedWinner ?? "—"}
                {forecast.winnerProbability !== null ? ` · ${formatPercent(forecast.winnerProbability)}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                xG {forecast.expectedHomeGoals.toFixed(2)}–{forecast.expectedAwayGoals.toFixed(2)}
                {forecast.mostLikelyScore
                  ? ` · ${forecast.mostLikelyScore}${forecast.mostLikelyScoreProbability !== null ? ` ${formatPercent(forecast.mostLikelyScoreProbability)}` : ""}`
                  : ""}
              </p>
              {forecast.homeWinProb !== null && forecast.drawProb !== null && forecast.awayWinProb !== null ? (
                <p className="text-xs text-muted-foreground">
                  H/D/A {formatPercent(forecast.homeWinProb)}/{formatPercent(forecast.drawProb)}/{formatPercent(forecast.awayWinProb)}
                  {forecast.over25Prob !== null ? ` · O2.5 ${formatPercent(forecast.over25Prob)}` : ""}
                  {forecast.bttsProb !== null ? ` · BTTS ${formatPercent(forecast.bttsProb)}` : ""}
                </p>
              ) : null}
              {forecast.topScorelines.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {forecast.topScorelines.map((line) => `${line.score} ${formatPercent(line.probability)}`).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No forecast for this match.</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bet</p>
          {match.bet ? (
            <p className="mt-1 font-medium">
              {match.bet.label}
              <span className="font-normal text-muted-foreground"> · {formatPercent(match.bet.probability)}</span>
              {match.bet.placed ? null : <span className="font-normal text-muted-foreground"> · not placed</span>}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No bet.</p>
          )}
        </div>

        {odds ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Odds booked</p>
            <p className="mt-1 font-medium tabular-nums">
              {odds.odds.toFixed(2)}
              <span className="font-normal text-muted-foreground"> · stake ${odds.stake.toFixed(2)} · edge {formatEdge(odds.expectedValue)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {odds.status === "open" ? "Open" : odds.outcome === "won" ? "Won" : "Lost"}
              {score ? ` · ${score}` : ""}
              {odds.pnl === null ? "" : ` · `}
              {odds.pnl === null ? null : <span className={pnlClass(odds.pnl)}>{formatPnl(odds.pnl)}</span>}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function MatchdayOnePagerView({
  page,
  pnlHistory,
  onClose,
  dialogRef,
}: {
  page: MatchdayOnePagerData;
  pnlHistory: SettledBookedPnl[];
  onClose: () => void;
  dialogRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      id="matchday-one-pager"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Gameweek ${page.gameweek} matchday one-pager`}
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-auto bg-background text-foreground outline-none print:static print:overflow-visible print:bg-white print:text-black"
    >
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Matchday one-pager</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Gameweek {page.gameweek}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {page.season} · {page.matches.length} match{page.matches.length === 1 ? "" : "es"} · {page.bookedCount} booked
              {page.bookedCount > 0 ? ` · stake $${page.stake.toFixed(2)}` : ""}
              {page.settledCount > 0 ? ` · settled ${formatPnl(page.settledPnl)}` : ""}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
            >
              <Printer className="size-4" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
            >
              <X className="size-4" />
              Close
            </button>
          </div>
        </header>

        {page.matches.length === 0 ? (
          <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
            No fixtures for Gameweek {page.gameweek}.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {page.matches.map((match) => (
              <MatchSheet key={match.fixtureId} match={match} />
            ))}
          </div>
        )}

        <BookedPnlStrip entries={pnlHistory} />
      </div>
    </div>
  );
}

export function MatchdayOnePager({
  page,
  pnlHistory,
  onClose,
}: {
  page: MatchdayOnePagerData;
  pnlHistory: SettledBookedPnl[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <MatchdayOnePagerView page={page} pnlHistory={pnlHistory} onClose={onClose} dialogRef={dialogRef} />,
    document.body,
  );
}
