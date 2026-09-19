"use client";

import { useEffect, useRef } from "react";
import type { RankedPlayer } from "@/lib/fpl-types";
import { formatNextFixtures } from "@/lib/rankings-client";
import { scoreStyle } from "@/lib/score-style";

function ScoreBadge({ score }: { score: number }) {
  const style = scoreStyle(score);
  return (
    <span
      className="score-badge"
      data-tone={style.tone}
      style={{
        color: style.color,
        background: style.background,
        borderColor: style.border,
      }}
    >
      {score.toFixed(1)}
    </span>
  );
}

export function RankingsTable({
  rankings,
  selectedRank,
}: {
  rankings: RankedPlayer[];
  selectedRank: number | null;
}) {
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedRank, rankings]);

  return (
    <div aria-label="Player rankings table" className="mosaic-rankings-table">
      <div className="mosaic-rankings-table-stage">
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Score</th>
              <th scope="col">Player</th>
              <th scope="col">Club</th>
              <th scope="col">Pos</th>
              <th scope="col">Price</th>
              <th scope="col">Form</th>
              <th scope="col">Mins</th>
              <th scope="col">xG</th>
              <th scope="col">xA</th>
              <th scope="col">Last yr/90</th>
              <th scope="col">Defcon</th>
              <th scope="col">Next fixtures</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((player) => (
              <tr
                key={player.playerId}
                ref={player.rank === selectedRank ? selectedRowRef : undefined}
                className={player.rank === selectedRank ? "mosaic-rankings-table-selected" : undefined}
              >
                <td>{player.rank}</td>
                <td><ScoreBadge score={player.score} /></td>
                <td>{player.name}</td>
                <td>{player.teamShortName}</td>
                <td>{player.position}</td>
                <td>£{player.cost.toFixed(1)}m</td>
                <td>{Math.round(player.formPoints)} pts</td>
                <td>{Math.round(player.minutes)}m</td>
                <td>{player.xg.toFixed(2)}</td>
                <td>{player.xa.toFixed(2)}</td>
                <td>{player.lastSeasonPointsPer90.toFixed(1)} pts</td>
                <td>{Math.round(player.defcon)}</td>
                <td>{formatNextFixtures(player)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
