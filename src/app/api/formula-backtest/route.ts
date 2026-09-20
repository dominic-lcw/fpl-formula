import { NextRequest, NextResponse } from "next/server";
import {
  calculateFormulaBacktests,
  TRACKER_PRESET_STRATEGIES,
} from "@/lib/formula-tracking-data";
import { sanitiseParams, type FormulaStrategy } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { strategies?: FormulaStrategy[] };
    const allowedIds = new Set(TRACKER_PRESET_STRATEGIES.map((strategy) => strategy.id));
    const strategies = (body.strategies ?? [])
      .filter((strategy) => strategy?.id && strategy?.params)
      .map((strategy) => ({
        ...strategy,
        params: sanitiseParams(strategy.params),
        source: strategy.source === "saved" ? "saved" as const : "preset" as const,
      }))
      .filter((strategy) => strategy.source === "saved" || allowedIds.has(strategy.id));

    if (strategies.length === 0) {
      return NextResponse.json({ error: "Choose at least one formula to track." }, { status: 400 });
    }

    return NextResponse.json({ reports: await calculateFormulaBacktests(strategies) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run the formula tracker." },
      { status: 500 },
    );
  }
}
