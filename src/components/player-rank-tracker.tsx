"use client";

import { ArrowDown, ArrowUp, Minus, PinOff, TrendingUp } from "lucide-react";
import type { Position } from "@/lib/fpl-types";

export type PinnedPlayerSnapshot = {
  rank: number;
  score: number;
  club: string;
  position: Position;
  delta: number | null;
};

type PlayerRankTrackerProps = {
  playerName: string;
  snapshot: PinnedPlayerSnapshot | null;
  history: Array<{ rank: number; score: number }>;
  isLoading: boolean;
  onUnpin: () => void;
};

function formatDelta(delta: number | null) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus size={14} /> No change
      </span>
    );
  }

  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <ArrowUp size={14} /> +{delta} ranks
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-rose-400">
      <ArrowDown size={14} /> {delta} ranks
    </span>
  );
}

export function PlayerRankTracker({
  playerName,
  snapshot,
  history,
  isLoading,
  onUnpin,
}: PlayerRankTrackerProps) {
  const bestRank = history.length ? Math.min(...history.map((entry) => entry.rank)) : null;
  const worstRank = history.length ? Math.max(...history.map((entry) => entry.rank)) : null;

  return (
    <CardLike className="border-cyan-400/20 bg-cyan-400/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-300/80">
            <TrendingUp size={14} /> Tracking player
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold">{playerName}</h3>
          {snapshot ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {snapshot.club} · {snapshot.position}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onUnpin}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <PinOff size={13} /> Unpin
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Global rank" value={snapshot ? `#${snapshot.rank}` : "—"} loading={isLoading} />
        <Metric label="Score" value={snapshot ? snapshot.score.toFixed(1) : "—"} loading={isLoading} />
        <div className="rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Since last tweak</p>
          <p className="mt-1 text-sm font-medium">{snapshot ? formatDelta(snapshot.delta) : "—"}</p>
        </div>
      </div>

      {history.length > 1 ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Formula session</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Best #{bestRank}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Worst #{worstRank}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{history.length} snapshots</span>
          </div>
          <div className="mt-3 flex h-8 items-end gap-1">
            {history.map((entry, index) => {
              const range = Math.max(worstRank! - bestRank!, 1);
              const height = 24 + ((worstRank! - entry.rank) / range) * 72;
              const isLatest = index === history.length - 1;
              return (
                <div
                  key={`${entry.rank}-${index}`}
                  title={`#${entry.rank} · ${entry.score.toFixed(1)} score`}
                  className={`min-w-2 flex-1 rounded-t-sm ${isLatest ? "bg-cyan-400" : "bg-cyan-400/35"}`}
                  style={{ height: `${Math.max(height, 12)}%` }}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Adjust the formula controls to see how this player&apos;s global rank moves.
        </p>
      )}
    </CardLike>
  );
}

function Metric({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${loading ? "opacity-60" : ""}`}>{value}</p>
    </div>
  );
}

function CardLike({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}
