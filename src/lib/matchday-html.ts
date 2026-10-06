import type { GameweekBookedPnl } from "@/lib/booked-pnl";
import type { MatchdayOnePager, OnePagerMatch } from "@/lib/matchday-one-pager";

export type MatchdayHtmlMatch = {
  fixtureId: number;
  kickoff: string | null;
  homeTeam: string;
  awayTeam: string;
  homeShortName: string;
  awayShortName: string;
  score: string | null;
  pnl: number | null;
  outcome: "open" | "won" | "lost" | null;
  forecastTitle: string;
  forecastLines: string[];
  bet: string | null;
  placed: boolean;
  odds: string | null;
  stake: number | null;
  edge: string | null;
};

export type MatchdayHtmlDocument = {
  season: string;
  gameweek: number;
  matchCount: number;
  bookedCount: number;
  stake: number;
  realized: boolean;
  settledPnl: number | null;
  matches: MatchdayHtmlMatch[];
  gameweeks: GameweekBookedPnl[];
};

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function forecastLines(match: OnePagerMatch) {
  const forecast = match.forecast;
  if (!forecast) return [];
  const lines = [
    forecast.predictedWinner
      ? `${forecast.predictedWinner}${forecast.winnerProbability !== null ? ` · ${formatPercent(forecast.winnerProbability)}` : ""}`
      : null,
    `xG ${forecast.expectedHomeGoals.toFixed(2)}–${forecast.expectedAwayGoals.toFixed(2)}${
      forecast.mostLikelyScore
        ? ` · ${forecast.mostLikelyScore}${forecast.mostLikelyScoreProbability !== null ? ` ${formatPercent(forecast.mostLikelyScoreProbability)}` : ""}`
        : ""
    }`,
  ];
  if (forecast.homeWinProb !== null && forecast.drawProb !== null && forecast.awayWinProb !== null) {
    lines.push(
      `H/D/A ${formatPercent(forecast.homeWinProb)} / ${formatPercent(forecast.drawProb)} / ${formatPercent(forecast.awayWinProb)}`,
    );
  }
  if (forecast.over25Prob !== null || forecast.bttsProb !== null) {
    lines.push(
      [
        forecast.over25Prob !== null ? `Over 2.5 ${formatPercent(forecast.over25Prob)}` : null,
        forecast.bttsProb !== null ? `BTTS ${formatPercent(forecast.bttsProb)}` : null,
      ].filter(Boolean).join(" · "),
    );
  }
  if (forecast.topScorelines.length > 0) {
    lines.push(forecast.topScorelines.map((line) => `${line.score} ${formatPercent(line.probability)}`).join(" · "));
  }
  return lines.filter((line): line is string => Boolean(line));
}

export function buildMatchdayHtmlDocument(
  page: MatchdayOnePager,
  gameweeks: GameweekBookedPnl[],
): MatchdayHtmlDocument {
  return {
    season: page.season,
    gameweek: page.gameweek,
    matchCount: page.matches.length,
    bookedCount: page.bookedCount,
    stake: page.stake,
    realized: page.realized,
    settledPnl: page.settledPnl,
    matches: page.matches.map((match) => ({
      fixtureId: match.fixtureId,
      kickoff: formatKickoff(match.kickoffTime),
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeShortName: match.homeShortName,
      awayShortName: match.awayShortName,
      score: match.result ? `${match.result.homeScore}–${match.result.awayScore}` : null,
      pnl: match.bookedOdds?.pnl ?? null,
      outcome: match.bookedOdds ? (match.bookedOdds.status === "open" ? "open" : match.bookedOdds.outcome) : null,
      forecastTitle: match.forecast?.source === "booked" ? "Forecast when booked" : "Forecast",
      forecastLines: forecastLines(match),
      bet: match.bet ? `${match.bet.label} · ${formatPercent(match.bet.probability)}` : null,
      placed: match.bet?.placed ?? false,
      odds: match.bookedOdds ? match.bookedOdds.odds.toFixed(2) : null,
      stake: match.bookedOdds?.stake ?? null,
      edge: match.bookedOdds ? formatEdge(match.bookedOdds.expectedValue) : null,
    })),
    gameweeks,
  };
}

export function matchdayHtmlFilename(page: { season: string; gameweek: number }) {
  const season = page.season.replaceAll(/[^\w.-]+/g, "-");
  return `${season}-gw${page.gameweek}-matchday.html`;
}

function pnlClass(value: number | null) {
  if (value === null) return "";
  return value >= 0 ? "up" : "down";
}

function matchCard(match: MatchdayHtmlMatch) {
  const outcome = match.outcome === "won" ? "Won" : match.outcome === "lost" ? "Lost" : match.outcome === "open" ? "Open" : "";
  return `<article class="match">
    <header class="match-top">
      <div>
        <h2>${escapeHtml(match.homeShortName)} vs ${escapeHtml(match.awayShortName)}</h2>
        <p class="sub">${escapeHtml(match.homeTeam)} · ${escapeHtml(match.awayTeam)}</p>
        ${match.kickoff ? `<p class="sub">${escapeHtml(match.kickoff)}</p>` : ""}
      </div>
      <div class="score">
        ${match.score ? `<p>${escapeHtml(match.score)}</p>` : ""}
        ${match.pnl !== null ? `<p class="${pnlClass(match.pnl)}">${escapeHtml(formatPnl(match.pnl))}</p>` : ""}
      </div>
    </header>
    <p class="label">${escapeHtml(match.forecastTitle)}</p>
    ${match.forecastLines.length > 0
      ? match.forecastLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
      : `<p class="sub">No forecast for this match.</p>`}
    <p class="label">Bet</p>
    <p>${match.bet ? `${escapeHtml(match.bet)}${match.placed ? "" : ` <span class="sub">· not placed</span>`}` : `<span class="sub">No bet.</span>`}</p>
    ${match.odds ? `<p class="label">Odds booked</p>
      <p>${escapeHtml(match.odds)} <span class="sub">· stake $${match.stake?.toFixed(2) ?? "0.00"} · edge ${escapeHtml(match.edge ?? "")}</span></p>
      ${outcome ? `<p class="sub">${outcome}</p>` : ""}` : ""}
  </article>`;
}

function gameweekChip(entry: GameweekBookedPnl, activeGameweek: number) {
  return `<article class="gw${entry.gameweek === activeGameweek ? " active" : ""}">
    <p class="label">GW${entry.gameweek}</p>
    <p class="figure ${pnlClass(entry.pnl)}">${escapeHtml(formatPnl(entry.pnl))}</p>
    <p class="sub">${entry.won}–${entry.lost} · ${entry.betCount} bet${entry.betCount === 1 ? "" : "s"}</p>
    <p class="sub ${pnlClass(entry.runningPnl)}">Book ${escapeHtml(formatPnl(entry.runningPnl))}</p>
  </article>`;
}

export function renderMatchdayHtml(page: MatchdayOnePager, gameweeks: GameweekBookedPnl[]) {
  const document = buildMatchdayHtmlDocument(page, gameweeks);
  const data = JSON.stringify(document).replaceAll("<", "\\u003c");
  const summary = [
    document.season,
    `${document.matchCount} match${document.matchCount === 1 ? "" : "es"}`,
    `${document.bookedCount} booked`,
    document.bookedCount > 0 ? `stake $${document.stake.toFixed(2)}` : null,
  ].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>GW${document.gameweek} matchday</title>
  <style>
    :root { color-scheme: light; --bg: #f3efe6; --ink: #1c1915; --muted: #6f675e; --card: #fffdf8; --line: #e3dbcf; --up: #0c7a45; --down: #b42318; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .sheet { max-width: 32rem; margin: 0 auto; padding: max(1.25rem, env(safe-area-inset-top)) 1rem max(1.75rem, env(safe-area-inset-bottom)); }
    .kicker { margin: 0; color: var(--muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    h1 { margin: 0.2rem 0 0; font-size: 2.4rem; letter-spacing: -0.045em; line-height: 1; }
    .summary { margin: 0.7rem 0 0; color: var(--muted); font-size: 0.92rem; }
    .pill { display: inline-block; margin-top: 0.8rem; border-radius: 999px; padding: 0.35rem 0.7rem; background: var(--card); border: 1px solid var(--line); font-weight: 700; font-variant-numeric: tabular-nums; }
    .up { color: var(--up); }
    .down { color: var(--down); }
    .match, .book { margin-top: 0.85rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--card); padding: 0.95rem 1rem; }
    .match-top, .book-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
    h2 { margin: 0; font-size: 1.05rem; letter-spacing: -0.02em; }
    .sub { margin: 0.15rem 0 0; color: var(--muted); font-size: 0.78rem; }
    .score { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .score p { margin: 0; font-size: 1.25rem; font-weight: 700; }
    .score .up, .score .down { font-size: 0.92rem; }
    .label { margin: 0.8rem 0 0.15rem; color: var(--muted); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .match p { margin: 0.1rem 0; }
    .row { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.2rem; }
    .gw { min-width: 6.4rem; border: 1px solid var(--line); border-radius: 0.8rem; padding: 0.55rem 0.65rem; }
    .gw.active { border-color: var(--ink); }
    .figure { margin: 0.15rem 0; font-size: 1.05rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .empty { margin-top: 1rem; border: 1px dashed var(--line); border-radius: 1rem; padding: 2rem 1rem; text-align: center; color: var(--muted); }
  </style>
</head>
<body>
  <main class="sheet">
    <p class="kicker">Matchday</p>
    <h1>GW ${document.gameweek}</h1>
    <p class="summary">${escapeHtml(summary)}</p>
    ${document.realized && document.settledPnl !== null ? `<p class="pill ${pnlClass(document.settledPnl)}">PnL ${escapeHtml(formatPnl(document.settledPnl))}</p>` : ""}
    ${document.matches.length === 0
      ? `<p class="empty">No fixtures for Gameweek ${document.gameweek}.</p>`
      : document.matches.map(matchCard).join("")}
    <section class="book" aria-label="Booked PnL by gameweek">
      <div class="book-head">
        <h2>Booked PnL</h2>
        <p class="sub">${document.gameweeks.length === 0 ? "From the first realized week" : `${document.gameweeks.length} gameweek${document.gameweeks.length === 1 ? "" : "s"}`}</p>
      </div>
      ${document.gameweeks.length === 0
        ? `<p class="sub">No realized gameweeks yet.</p>`
        : `<div class="row">${document.gameweeks.map((entry) => gameweekChip(entry, document.gameweek)).join("")}</div>`}
    </section>
  </main>
  <script type="application/json" id="matchday-data">${data}</script>
</body>
</html>
`;
}
