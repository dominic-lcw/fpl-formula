"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { liveGameweekForRankings, type LiveGameweekStatus } from "@/lib/fpl-gameweeks";
import type { Position, RankingParams } from "@/lib/fpl-types";
import { calculateMosaicRankings, type MosaicRankingData } from "@/lib/mosaic-rankings";
import { DEFAULT_PARAMS, sanitiseParams } from "@/lib/scoring";

type StatusResponse = {
  liveGameweek: LiveGameweekStatus | null;
};

type DashboardContextValue = {
  params: RankingParams;
  updateParams: (nextParams: RankingParams) => void;
  data: MosaicRankingData | null;
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
  const [data, setData] = useState<MosaicRankingData | null>(null);
  const [position, setPositionState] = useState<Position | "ALL">("ALL");
  const [team, setTeamState] = useState("ALL");
  const [tableVersion, setTableVersion] = useState(0);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveGameweek, setLiveGameweek] = useState<LiveGameweekStatus | null>(null);
  const [showLiveData, setShowLiveData] = useState(false);
  const latestRequest = useRef(0);

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
    nextPosition: Position | "ALL",
    nextTeam: string,
    options: {
      refreshDataset?: boolean;
      liveGameweek?: number | null;
    } = {},
  ) => {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const payload = await calculateMosaicRankings(nextParams, nextPosition, nextTeam, options);
      if (requestId === latestRequest.current) {
        setData(payload);
        setSelectedRank(null);
        setTableVersion((version) => version + 1);
      }
    } catch (reason) {
      if (requestId === latestRequest.current) {
        setError(reason instanceof Error ? reason.message : "Unable to calculate rankings locally.");
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
      void loadRankings(savedParams, "ALL", "ALL");
      void loadLiveGameweek();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLiveGameweek, loadRankings]);

  function updateParams(nextParams: RankingParams) {
    setParams(nextParams);
    window.localStorage.setItem("fpl-ranking-preset", JSON.stringify(nextParams));
    void loadRankings(nextParams, position, team, {
      liveGameweek: showLiveData ? liveGameweekForRankings(liveGameweek) : null,
    });
  }

  function setPosition(nextPosition: Position | "ALL") {
    setPositionState(nextPosition);
    void loadRankings(params, nextPosition, team, {
      liveGameweek: showLiveData ? liveGameweekForRankings(liveGameweek) : null,
    });
  }

  function setTeam(nextTeam: string) {
    setTeamState(nextTeam);
    void loadRankings(params, position, nextTeam, {
      liveGameweek: showLiveData ? liveGameweekForRankings(liveGameweek) : null,
    });
  }

  function updateLiveData(enabled: boolean) {
    setShowLiveData(enabled);
    if (!enabled) {
      void loadRankings(params, position, team);
      return;
    }

    void loadLiveGameweek().then((nextLiveGameweek) => {
      void loadRankings(params, position, team, {
        liveGameweek: liveGameweekForRankings(nextLiveGameweek),
      });
    });
  }

  function refreshRankings() {
    void loadLiveGameweek().then((nextLiveGameweek) => {
      void loadRankings(params, position, team, {
        refreshDataset: true,
        liveGameweek: showLiveData ? liveGameweekForRankings(nextLiveGameweek) : null,
      });
    });
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
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
