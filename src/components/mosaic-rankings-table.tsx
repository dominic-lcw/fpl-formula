"use client";

import { useEffect, useRef, useState } from "react";
import { getMosaic } from "@/lib/mosaic-rankings";

type TableElement = HTMLElement & {
  value?: {
    destroy: () => void;
    pending: Promise<unknown>;
  };
};

type TableStatus = "loading" | "ready" | "error";

function formatNumber(value: unknown, digits = 0) {
  return Number(value).toFixed(digits);
}

export function MosaicRankingsTable({ version }: { version: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<TableStatus>("loading");

  useEffect(() => {
    let isCurrent = true;
    let table: TableElement | undefined;
    const host = hostRef.current;

    if (!host) return;
    host.replaceChildren();

    void Promise.resolve().then(() => {
      if (isCurrent) setStatus("loading");
    });

    const mountTable = async () => {
      const vg = await getMosaic();
      if (!isCurrent) return;

      table = vg.table({
        element: host,
        from: "ranked_players",
        columns: [
          "rank",
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
          "score",
        ],
        height: 600,
        rowBatch: 80,
        width: {
          rank: 64,
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
          score: 78,
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

      await table.value?.pending;
    };

    void mountTable().then(
      () => {
        if (isCurrent) setStatus("ready");
      },
      () => {
        if (isCurrent) setStatus("error");
      },
    );

    return () => {
      isCurrent = false;
      table?.value?.destroy();
      table?.remove();
    };
  }, [version]);

  return (
    <>
      <div
        ref={hostRef}
        aria-busy={status === "loading"}
        aria-label="Player rankings table"
        className="mosaic-rankings-table"
      />
      {status === "loading" && <p className="py-12 text-center text-slate-400">Preparing the scrollable table…</p>}
      {status === "error" && <p className="py-12 text-center text-rose-200">Unable to prepare the scrollable table.</p>}
    </>
  );
}
