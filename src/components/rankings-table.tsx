"use client";

import { useEffect, useRef } from "react";
import type { RankedPlayer } from "@/lib/fpl-types";
import { paintScoreColumn } from "@/lib/score-style";

function formatNumber(value: number, digits = 0) {
  return value.toFixed(digits);
}

function formatFixtures(player: RankedPlayer) {
  if (!player.fixtures.length) return "—";
  return player.fixtures
    .map((fixture) => `${fixture.opponent.slice(0, 3).toUpperCase()} ${fixture.wasHome ? "H" : "A"}`)
    .join(" · ");
}

function highlightRankedRow(host: HTMLElement, rank: number | null) {
  const rows = Array.from(host.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  for (const row of rows) row.classList.remove("rankings-table-selected");
  if (rank === null) return;

  const selectedRow = rows.find((row) => row.cells.item(0)?.textContent?.trim() === String(rank));
  if (!selectedRow) return;

  selectedRow.classList.add("rankings-table-selected");
  selectedRow.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function RankingsTable({
  rankings,
  selectedRank,
}: {
  rankings: RankedPlayer[];
  selectedRank: number | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hostRef.current) highlightRankedRow(hostRef.current, selectedRank);
  }, [selectedRank, rankings]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return paintScoreColumn(host, 2);
  }, [rankings]);

  if (rankings.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No ranked players match the current filters.</p>;
  }

  return (
    <div ref={hostRef} aria-label="Player rankings table" className="rankings-table overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Score</th>
            <th>Player</th>
            <th>Club</th>
            <th>Pos</th>
            <th>Price</th>
            <th>Form</th>
            <th>Mins</th>
            <th>xG</th>
            <th>xA</th>
            <th>Last yr/90</th>
            <th>Defcon</th>
            <th>Next fixtures</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((player) => (
            <tr key={player.playerId}>
              <td>{player.rank}</td>
              <td>{formatNumber(player.score, 1)}</td>
              <td>{player.name}</td>
              <td>{player.teamShortName}</td>
              <td>{player.position}</td>
              <td>${formatNumber(player.cost, 1)}m</td>
              <td>{formatNumber(player.formPoints)} pts</td>
              <td>{formatNumber(player.minutes)}m</td>
              <td>{formatNumber(player.xg, 2)}</td>
              <td>{formatNumber(player.xa, 2)}</td>
              <td>{formatNumber(player.lastSeasonPointsPer90, 1)} pts</td>
              <td>{formatNumber(player.defcon)}</td>
              <td>{formatFixtures(player)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
