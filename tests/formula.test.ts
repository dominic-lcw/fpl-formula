import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import { FORMULA, fplBonusSumSql, individualRawSql } from "../src/lib/formula";
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
  });

  it("sums official FPL bonus for display columns only", () => {
    expect(fplBonusSumSql("s")).toContain("sum(coalesce(s.bonus");
  });
});
