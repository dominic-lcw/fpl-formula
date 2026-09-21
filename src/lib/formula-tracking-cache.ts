export type BacktestRound = {
  gameweek: number;
  pickedPlayers: number;
  points: number;
};

export type StrategyBacktest = {
  strategyId: string;
  totalPoints: number;
  averagePoints: number;
  completeSelections: number;
  rounds: BacktestRound[];
};

const backtestCacheKey = "fpl-formula-backtest-v2";

export function buildBacktestCacheKey(syncKey: string, strategyIds: string[]) {
  return `${syncKey}:${[...strategyIds].sort().join(",")}`;
}

export function readCachedBacktests(cacheKey: string): StrategyBacktest[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(backtestCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cacheKey: string; reports: StrategyBacktest[] };
    return parsed.cacheKey === cacheKey ? parsed.reports : null;
  } catch {
    return null;
  }
}

export function writeCachedBacktests(cacheKey: string, reports: StrategyBacktest[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(backtestCacheKey, JSON.stringify({ cacheKey, reports }));
}
