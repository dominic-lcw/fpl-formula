import type { RankingParams } from "@/lib/fpl-types";

export type FormulaStrategy = {
  id: string;
  name: string;
  description: string;
  params: RankingParams;
  source: "starter" | "saved";
};

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

const starterStrategies = [
  ["balanced", "Balanced", "A practical blend of recent form, team momentum, and the next three fixtures.", 5, 3, 45, 20, 35],
  ["form-surge", "Form surge", "Rewards the sharpest recent player and team form over a short horizon.", 3, 2, 65, 25, 10],
  ["fixture-hunter", "Fixture hunter", "Leans hard into the upcoming schedule while retaining a form check.", 4, 5, 25, 15, 60],
  ["steady-signal", "Steady signal", "Uses a longer form window to soften one-gameweek volatility.", 8, 4, 50, 30, 20],
  ["player-first", "Player first", "Prioritises individual underlying numbers and FPL returns.", 6, 3, 75, 15, 10],
  ["team-momentum", "Team momentum", "Gives more weight to attacking and defensive team performance.", 5, 3, 35, 50, 15],
  ["next-up", "Next up", "Optimises for the immediate two-gameweek fixture opportunity.", 4, 2, 35, 15, 50],
  ["all-rounder", "All-rounder", "A diversified signal designed to avoid any single component dominating.", 6, 4, 40, 30, 30],
] as const;

export const STARTER_STRATEGIES: FormulaStrategy[] = starterStrategies.map(
  ([id, name, description, formWindow, fixtureHorizon, individual, team, fixtures]) => ({
    id,
    name,
    description,
    params: {
      formWindow,
      fixtureHorizon,
      minMinutes: 0,
      weights: { individual, team, fixtures },
    },
    source: "starter",
  }),
);
