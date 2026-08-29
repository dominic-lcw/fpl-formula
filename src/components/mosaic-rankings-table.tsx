"use client";

import { useEffect, useRef, useState } from "react";
import { getMosaic } from "@/lib/mosaic-rankings";
import { paintScoreColumn } from "@/lib/score-style";

const rankingColumns = [
  "rank",
  "score",
  "player",
  "club",
  "position",
  "price",
  "form_points",
  "minutes",
  "xg",
  "xa",
  "last_year_per_90",
  "defcon",
  "next_fixtures",
] as const;

const scoreColumnIndex = rankingColumns.indexOf("score") + 1;

type TableElement = HTMLElement & {
  value?: {
    destroy: () => void;
    pending: Promise<unknown>;
  };
};

function formatNumber(value: unknown, digits = 0) {
  return Number(value).toFixed(digits);
}

export function MosaicRankingsTable({ version }: { version: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeTableRef = useRef<TableElement | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stagedTable: TableElement | undefined;
    let disconnectColors: (() => void) | undefined;
    const host = hostRef.current;

    if (!host) return;

    const mountTable = async () => {
      const vg = await getMosaic();
      if (cancelled) return;

      const stage = document.createElement("div");
      stage.className = "mosaic-rankings-table-stage";
      stagedTable = vg.table({
        element: stage,
        from: "ranked_players",
        columns: [...rankingColumns],
        height: 600,
        rowBatch: 120,
        width: {
          rank: 64,
          score: 88,
          player: 170,
          club: 64,
          position: 72,
          price: 84,
          form_points: 100,
          minutes: 82,
          xg: 66,
          xa: 66,
          last_year_per_90: 130,
          defcon: 76,
          next_fixtures: 158,
        },
        align: {
          score: "center",
        },
        format: {
          price: (value: unknown) => `£${formatNumber(value, 1)}m`,
          form_points: (value: unknown) => `${formatNumber(value)} pts`,
          minutes: (value: unknown) => `${formatNumber(value)}m`,
          xg: (value: unknown) => formatNumber(value, 2),
          xa: (value: unknown) => formatNumber(value, 2),
          last_year_per_90: (value: unknown) => `${formatNumber(value, 1)} pts`,
          defcon: (value: unknown) => formatNumber(value),
          score: (value: unknown) => formatNumber(value, 1),
        },
      }) as TableElement;

      await stagedTable.value?.pending;
      if (cancelled) return;

      const previousTable = activeTableRef.current;
      host.replaceChildren(stage);
      activeTableRef.current = stagedTable;
      previousTable?.value?.destroy();
      disconnectColors = paintScoreColumn(stage, scoreColumnIndex);
    };

    void mountTable().then(
      () => {
        if (!cancelled) setError(false);
      },
      () => {
        if (!cancelled) setError(true);
      },
    );

    return () => {
      cancelled = true;
      disconnectColors?.();
      if (stagedTable && activeTableRef.current !== stagedTable) {
        stagedTable.value?.destroy();
        stagedTable.remove();
      }
    };
  }, [version]);

  useEffect(
    () => () => {
      activeTableRef.current?.value?.destroy();
      activeTableRef.current?.remove();
    },
    [],
  );

  return (
    <>
      <div
        ref={hostRef}
        aria-label="Player rankings table"
        className="mosaic-rankings-table"
      />
      {error && <p className="py-12 text-center text-rose-200">Unable to prepare the scrollable table.</p>}
    </>
  );
}
