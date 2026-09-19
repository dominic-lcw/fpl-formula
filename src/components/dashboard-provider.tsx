"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PinnedPlayerSnapshot } from "@/components/player-rank-tracker";
import { liveGameweekForRankings, type LiveGameweekStatus } from "@/lib/fpl-gameweeks";
import type { Position, RankingParams, RankingResponse } from "@/lib/fpl-types";
import {
  fetchRankings,
  getPinnedPlayerRank,
  type RankedPlayerSuggestion,
} from "@/lib/rankings-client";
import { DEFAULT_PARAMS, sanitiseParams } from "@/lib/scoring";

type StatusResponse = {
  liveGameweek: LiveGameweekStatus | null;
};

type DashboardContextValue = {
  params: RankingParams;
  updateParams: (nextParams: RankingParams) => void;
  data: RankingResponse | null;
  position: Position | "ALL";
  setPosition: (position: Position | "ALL") => void;
  team: string;
  setTeam: (team: string) => void;
  tableVersion: number;
  selectedRank: number | null;
  setSelectedRank: (rank: number | null) => void;
  isLoading: boolean;
  error: string | null;
  liveGameweek: LiveGameweekStatus | null;
  showLiveData: boolean;
  updateLiveData: (enabled: boolean) => void;
  refreshRankings: () => void;
  seasonLabel: string;
  pinnedPlayer: { playerId: number; name: string } | null;
  pinnedSnapshot: PinnedPlayerSnapshot | null;
  rankHistory: Array<{ rank: number; score: number }>;
  pinPlayer: (player: RankedPlayerSuggestion | null) => void;
  unpinPlayer: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider.");
  }
  return context;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useState<RankingParams>(DEFAULT_PARAMS);
  const [data, setData] = useState<RankingResponse | null>(null);
  const [position, setPositionState] = useState<Position | "ALL">("ALL");
  const [team, setTeamState] = useState("ALL");
  const [tableVersion, setTableVersion] = useState(0);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [pinnedPlayer, setPinnedPlayer] = useState<{ playerId: number; name: string } | null>(null);
  const [pinnedSnapshot, setPinnedSnapshot] = useState<PinnedPlayerSnapshot | null>(null);
  const [rankHistory, setRankHistory] = useState<Array<{ rank: number; score: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveGameweek, setLiveGameweek] = useState<LiveGameweekStatus | null>(null);
  const [showLiveData, setShowLiveData] = useState(false);
  const latestRequest = useRef(0);
  const previousPinnedRank = useRef<number | null>(null);
  const pinnedPlayerRef = useRef(pinnedPlayer);

  useEffect(() => {
    pinnedPlayerRef.current = pinnedPlayer;
  }, [pinnedPlayer]);

  const loadLiveGameweek = useCallback(async (): Promise<LiveGameweekStatus | null> => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) return null;
      const payload = await response.json() as StatusResponse;
      setLiveGameweek(payload.liveGameweek);
      return payload.liveGameweek;
    } catch {
      setLiveGameweek(null);
      return null;
    }
  }, []);

  const loadRankings = useCallback(async (
    nextParams: RankingParams,
    options: {
      liveGameweek?: number | null;
      cache?: RequestCache;
    } = {},
  ) => {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchRankings(nextParams, options);
      if (requestId === latestRequest.current) {
        setData(payload);
        setTableVersion((version) => version + 1);

        const activePinnedPlayer = pinnedPlayerRef.current;
        if (activePinnedPlayer) {
          const snapshot = getPinnedPlayerRank(payload.rankings, activePinnedPlayer.playerId);
          if (requestId !== latestRequest.current) return;

          if (snapshot) {
            const delta = previousPinnedRank.current === null
              ? null
              : previousPinnedRank.current - snapshot.rank;
            previousPinnedRank.current = snapshot.rank;
            setPinnedSnapshot({
              rank: snapshot.rank,
              score: snapshot.score,
              club: snapshot.club,
              position: snapshot.position,
              delta,
            });
            setRankHistory((history) => [...history.slice(-19), { rank: snapshot.rank, score: snapshot.score }]);
            setSelectedRank(snapshot.rank);
          } else {
            setPinnedSnapshot(null);
            setSelectedRank(null);
          }
        } else {
          setSelectedRank(null);
        }
      }
    } catch (reason) {
      if (requestId === latestRequest.current) {
        setError(reason instanceof Error ? reason.message : "Unable to load rankings.");
      }
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let savedParams = DEFAULT_PARAMS;
    const saved = window.localStorage.getItem("fpl-ranking-preset");
    if (saved) {
      try {
        savedParams = sanitiseParams(JSON.parse(saved) as RankingParams);
      } catch {
        window.localStorage.removeItem("fpl-ranking-preset");
      }
    }
    const timeout = window.setTimeout(() => {
      setParams(savedParams);
      void loadRankings(savedParams);
      void loadLiveGameweek();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLiveGameweek, loadRankings]);

  function updateParams(nextParams: RankingParams) {
    setParams(nextParams);
    window.localStorage.setItem("fpl-ranking-preset", JSON.stringify(nextParams));
    void loadRankings(nextParams, {
      liveGameweek: showLiveData ? liveGameweekForRankings(liveGameweek) : null,
    });
  }

  function setPosition(nextPosition: Position | "ALL") {
    setPositionState(nextPosition);
  }

  function setTeam(nextTeam: string) {
    setTeamState(nextTeam);
  }

  function updateLiveData(enabled: boolean) {
    setShowLiveData(enabled);
    if (!enabled) {
      void loadRankings(params);
      return;
    }

    void loadLiveGameweek().then((nextLiveGameweek) => {
      void loadRankings(params, {
        liveGameweek: liveGameweekForRankings(nextLiveGameweek),
      });
    });
  }

  function refreshRankings() {
    void loadLiveGameweek().then((nextLiveGameweek) => {
      void loadRankings(params, {
        cache: "no-store",
        liveGameweek: showLiveData ? liveGameweekForRankings(nextLiveGameweek) : null,
      });
    });
  }

  function pinPlayer(player: RankedPlayerSuggestion | null) {
    const nextPinnedPlayer = player
      ? { playerId: player.playerId, name: player.player }
      : null;
    setPinnedPlayer(nextPinnedPlayer);
    pinnedPlayerRef.current = nextPinnedPlayer;

    if (!player) {
      previousPinnedRank.current = null;
      setPinnedSnapshot(null);
      setRankHistory([]);
      setSelectedRank(null);
      return;
    }

    previousPinnedRank.current = player.rank;
    setPinnedSnapshot({
      rank: player.rank,
      score: player.score,
      club: player.club,
      position: player.position,
      delta: null,
    });
    setRankHistory([{ rank: player.rank, score: player.score }]);
    setSelectedRank(player.rank);
  }

  function unpinPlayer() {
    pinPlayer(null);
  }

  const seasonLabel = data?.season
    ? `${data.season} · ${data.includesLiveGameweek ? `live through GW${data.currentGameweek ?? "?"}` : `after GW${data.currentGameweek ?? "?"}`}`
    : "Awaiting first hydration";

  return (
    <DashboardContext.Provider
      value={{
        params,
        updateParams,
        data,
        position,
        setPosition,
        team,
        setTeam,
        tableVersion,
        selectedRank,
        setSelectedRank,
        isLoading,
        error,
        liveGameweek,
        showLiveData,
        updateLiveData,
        refreshRankings,
        seasonLabel,
        pinnedPlayer,
        pinnedSnapshot,
        rankHistory,
        pinPlayer,
        unpinPlayer,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
