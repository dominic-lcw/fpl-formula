"use client";

import { useEffect, useRef, useState } from "react";
import type { RankedPlayer } from "@/lib/fpl-types";

const TABLE_NAME = "ranked_players";

type TableElement = HTMLElement & {
  value?: {
    destroy: () => void;
    pending: Promise<unknown>;
  };
};

type TableStatus = "loading" | "ready" | "error" | "empty";
type Vgplot = typeof import("@uwdata/vgplot");

let vgplotPromise: Promise<Vgplot> | undefined;
let databaseUpdate: Promise<void> = Promise.resolve();

function getVgplot() {
  if (!vgplotPromise) {
    vgplotPromise = import("@uwdata/vgplot").then((vg) => {
      vg.coordinator().databaseConnector(vg.wasmConnector());
      return vg;
    });
  }
  return vgplotPromise;
}

function toTableRows(rankings: RankedPlayer[]) {
  return rankings.map((player) => ({
    rank: player.rank,
    player: player.name,
    club: player.teamShortName,
    position: player.position,
    price: player.cost,
    form_points: player.formPoints,
    minutes: player.minutes,
    xg: player.xg,
    xa: player.xa,
    last_year_per_90: player.lastSeasonPointsPer90,
    defcon: player.defcon,
    next_fixtures:
      player.fixtures
        .slice(0, 3)
        .map((fixture) => `${fixture.opponent.slice(0, 3).toUpperCase()} ${fixture.wasHome ? "H" : "A"}`)
        .join(" · ") || "—",
    score: player.score,
  }));
}

function formatNumber(value: unknown, digits = 0) {
  return Number(value).toFixed(digits);
}

export function MosaicRankingsTable({ rankings }: { rankings: RankedPlayer[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<TableStatus>("loading");

  useEffect(() => {
    let isCurrent = true;
    let table: TableElement | undefined;
    const host = hostRef.current;

    if (!host) return;
    host.replaceChildren();

    if (!rankings.length) {
      setStatus("empty");
      return;
    }

    setStatus("loading");

    const loadTable = async () => {
      const vg = await getVgplot();
      const coordinator = vg.coordinator();
      coordinator.clear({ clients: false });
      await coordinator.exec(vg.loadObjects(TABLE_NAME, toTableRows(rankings), { replace: true }));

      if (!isCurrent) return;

      table = vg.table({
        element: host,
        from: TABLE_NAME,
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

    const queuedUpdate = databaseUpdate.then(loadTable);
    databaseUpdate = queuedUpdate.catch(() => undefined);

    void queuedUpdate.then(
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
  }, [rankings]);

  return (
    <>
      <div
        ref={hostRef}
        aria-busy={status === "loading"}
        aria-label="Player rankings table"
        className="mosaic-rankings-table"
      />
      {status === "loading" && <p className="py-12 text-center text-slate-400">Preparing the scrollable table…</p>}
      {status === "empty" && <p className="py-12 text-center text-slate-400">No players match these filters.</p>}
      {status === "error" && <p className="py-12 text-center text-rose-200">Unable to prepare the scrollable table.</p>}
    </>
  );
}
