import { ChevronDown } from "lucide-react";
import type { ForecastParams } from "@/lib/match-forecast-model";
import {
  FORECAST_LAMBDA_AWAY_TEXT,
  FORECAST_LAMBDA_HOME_TEXT,
  FORECAST_RATING_NOTE,
  FORECAST_SIMULATION_NOTE,
} from "@/lib/match-forecast-model";

export type MatchForecastFormulaContext = {
  season: string;
  ratingGameweekStart: number;
  ratingGameweekEnd: number;
  finishedFixturesUsed: number;
  leagueAverageGoals: number | null;
  selectedForecastGameweek: number | null;
};

export function MatchForecastFormula({
  params,
  context,
}: {
  params: ForecastParams;
  context?: MatchForecastFormulaContext | null;
}) {
  const ratingRange =
    context && context.ratingGameweekEnd > 0
      ? context.ratingGameweekStart === context.ratingGameweekEnd
        ? `GW${context.ratingGameweekEnd}`
        : `GW${context.ratingGameweekStart}–GW${context.ratingGameweekEnd}`
      : null;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-base font-semibold tracking-tight">How the forecast is calculated</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ratings, expected goals, and simulation steps.</p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          size={20}
        />
      </summary>

      <div className="mt-5 grid gap-5 border-t pt-5 text-sm">
        <section>
          <h3 className="font-medium">Data windows</h3>
          <ul className="mt-2 grid gap-1.5 leading-6 text-muted-foreground">
            {context && ratingRange ? (
              <>
                <li>
                  <span className="text-foreground">Team ratings</span>:{" "}
                  {context.finishedFixturesUsed} finished match
                  {context.finishedFixturesUsed === 1 ? "" : "es"} with scores from{" "}
                  <span className="font-mono text-foreground">{ratingRange}</span> ({params.lookbackGameweeks}-GW
                  lookback ending at the latest completed Gameweek).
                </li>
                <li>
                  <span className="text-foreground">League average</span>:{" "}
                  {context.leagueAverageGoals != null
                    ? `${context.leagueAverageGoals.toFixed(2)} goals per team per match`
                    : "—"}{" "}
                  from those same fixtures ({context.season}).
                </li>
                <li>
                  <span className="text-foreground">Fixture probabilities</span>: Monte Carlo on{" "}
                  <span className="font-mono text-foreground">unfinished</span> fixtures only
                  {context.selectedForecastGameweek != null
                    ? ` (currently viewing GW${context.selectedForecastGameweek}).`
                    : "."}{" "}
                  In-progress Gameweeks do not enter ratings until every match in that Gameweek is finished.
                </li>
              </>
            ) : (
              <>
                <li>
                  Team ratings use finished fixtures over the last {params.lookbackGameweeks} Gameweeks through the
                  latest completed Gameweek in the hydrated data.
                </li>
                <li>Probabilities are simulated for upcoming unfinished fixtures only.</li>
              </>
            )}
          </ul>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-md border bg-muted/30 p-3">
            <h3 className="font-medium">Expected goals</h3>
            <p className="mt-2 font-mono text-xs leading-5 text-foreground">{FORECAST_LAMBDA_HOME_TEXT}</p>
            <p className="mt-2 font-mono text-xs leading-5 text-foreground">{FORECAST_LAMBDA_AWAY_TEXT}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{FORECAST_RATING_NOTE}</p>
          </section>
          <section className="rounded-md border bg-muted/30 p-3">
            <h3 className="font-medium">Simulation</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{FORECAST_SIMULATION_NOTE}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Home advantage multiplier: {params.homeAdvantage.toFixed(2)} · correlation λ₃ scale:{" "}
              {params.correlation.toFixed(2)} · rankings formula blend:{" "}
              {(params.formulaStrengthBlend * 100).toFixed(0)}% · FPL blend:{" "}
              {(params.fplStrengthBlend * 100).toFixed(0)}% · {params.simulations.toLocaleString()} runs.
            </p>
          </section>
        </div>
      </div>
    </details>
  );
}
