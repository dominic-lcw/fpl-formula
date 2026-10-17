import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScorelineHeatmap } from "../src/components/match-simulation";
import {
  createMonteCarloAccumulator,
  scoreCellIndex,
  snapshotMonteCarlo,
} from "../src/lib/match-forecast-model";

describe("scoreline heatmap", () => {
  it("renders streaming counts and marks the full-time score", () => {
    const accumulator = createMonteCarloAccumulator();
    const homeWin = scoreCellIndex(1, 0);
    const result = scoreCellIndex(2, 1);
    accumulator.counts[homeWin] = 40;
    accumulator.counts[result] = 12;
    accumulator.simulations = 52;
    accumulator.homeWins = 40;
    accumulator.totalHome = 64;
    accumulator.totalAway = 12;
    const frame = {
      ...snapshotMonteCarlo(accumulator, [homeWin]),
      total: 100,
      done: false,
    };

    const html = renderToStaticMarkup(
      <ScorelineHeatmap
        frame={frame}
        homeLabel="ARS"
        awayLabel="CHE"
        actualHome={2}
        actualAway={1}
      />,
    );

    expect(html).toContain('data-cell="1-0"');
    expect(html).toContain('data-count="40"');
    expect(html).toContain('data-cell="2-1"');
    expect(html).toContain("FT");
    expect(html).toContain("ARS");
    expect(html).toContain("CHE goals");
  });
});