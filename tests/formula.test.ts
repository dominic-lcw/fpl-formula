import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import {
  backtestSampleGameweeksSql,
  fixtureMatchScoreSql,
  FORMULA,
  fplBonusSumSql,
  individualRawSql,
  liveSampleGameweeksSql,
} from "../src/lib/formula";
import { buildMultiFormulaBacktestQuery, TRACKER_PRESET_STRATEGIES } from "../src/lib/formula-tracking-data";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-balance-${randomUUID()}`);
process.env.FPL_PARQUET_DIR = testParquetDirectory;

beforeAll(async () => {
  await import("../src/lib/db");
});

describe("shared individual expression", () => {
  it("uses the same attack and defence weights in SQL backtests", () => {
    const expression = individualRawSql("pf");
    const backtest = buildMultiFormulaBacktestQuery([TRACKER_PRESET_STRATEGIES[0]!]);
    expect(expression).toContain(`attack_con * ${FORMULA.attackCon}`);
    expect(expression).toContain(`defcon * ${FORMULA.defcon}`);
    expect(expression).not.toContain("bonus_points");
    expect(expression).not.toContain("CASE WHEN");
    expect(backtest).toContain(expression);
    expect(backtest).toContain(`* ${FORMULA.teamDefcon}`);
    expect(backtest).toContain(`* ${FORMULA.teamAttackCon}`);
    expect(backtest).toContain(fixtureMatchScoreSql("u.difficulty", "u.was_home"));
    expect(backtest).toContain(backtestSampleGameweeksSql("pf.target_gw", "s.form_window"));
    expect(backtest).not.toContain("avg((6 - difficulty");
    expect(backtest).not.toContain("max(fixture_raw) OVER");
  });

  it("counts the same finished gameweeks the ranking query samples", () => {
    expect(liveSampleGameweeksSql("c.current_gameweek", 3)).toBe(
      "(c.current_gameweek - greatest(1, c.current_gameweek - 2) + 1)",
    );
    expect(backtestSampleGameweeksSql("pf.target_gw", "s.form_window")).toBe(
      "(pf.target_gw - greatest(1, pf.target_gw - s.form_window))",
    );
  });

  it("sums official FPL bonus for display columns only", () => {
    expect(fplBonusSumSql("s")).toContain("sum(coalesce(s.bonus");
  });
});
