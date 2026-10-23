import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchForecastFormula } from "../src/components/match-forecast-formula";
import { DEFAULT_FORECAST_PARAMS } from "../src/lib/match-forecast-model";

describe("MatchForecastFormula", () => {
  it("shows the finished-fixture GW band used for ratings", () => {
    const html = renderToStaticMarkup(
      <MatchForecastFormula
        params={DEFAULT_FORECAST_PARAMS}
        context={{
          season: "2025-26",
          ratingGameweekStart: 3,
          ratingGameweekEnd: 12,
          finishedFixturesUsed: 90,
          leagueAverageGoals: 1.38,
          selectedForecastGameweek: 13,
        }}
      />,
    );
    expect(html).toContain("GW3–GW12");
    expect(html).toContain("90 finished matches");
    expect(html).toContain("GW13");
    expect(html).toContain("unfinished");
  });
});
