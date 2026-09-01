import { ChevronDown } from "lucide-react";
import type { RankingParams } from "@/lib/fpl-types";

const weightLabels = [
  { key: "individual", label: "Individual form", symbol: "I" },
  { key: "team", label: "Team form", symbol: "T" },
  { key: "fixtures", label: "Fixture outlook", symbol: "F" },
  { key: "venue", label: "Home / away", symbol: "V" },
] as const;

export function ScoreFormula({ params }: { params: RankingParams }) {
  const totalWeight =
    params.weights.individual +
      params.weights.team +
      params.weights.fixtures +
      params.weights.venue || 1;
  const isZeroWeighting =
    params.weights.individual +
      params.weights.team +
      params.weights.fixtures +
      params.weights.venue ===
    0;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-50">How the score is calculated</h2>
          <p className="mt-1 text-sm text-slate-400">Formula and inputs update as you tune the controls.</p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 text-cyan-200 transition-transform group-open:rotate-180"
          size={20}
        />
      </summary>

      <div className="mt-5 grid gap-5 border-t border-white/10 pt-5 text-sm text-slate-300">
        <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-cyan-100">Current weighted score</p>
          <p className="mt-2 overflow-x-auto font-mono text-sm leading-6 text-slate-100">
            score = (I × {params.weights.individual} + T × {params.weights.team} + F ×{" "}
            {params.weights.fixtures} + V × {params.weights.venue}) ÷ {totalWeight}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            I, T, F, and V are each normalised to a 0–100 score before their relative weights
            are applied.
            {isZeroWeighting ? " All weights are zero, so the denominator falls back to 1." : ""}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {weightLabels.map(({ key, label, symbol }) => {
            const weight = params.weights[key];
            return (
              <div key={key} className="rounded-lg border border-white/10 bg-slate-950/20 px-3 py-2">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 font-medium text-slate-100">
                  {symbol} × {weight}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    ({((weight / totalWeight) * 100).toFixed(1)}%)
                  </span>
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h3 className="font-medium text-slate-100">Scoring window and eligibility</h3>
            <ul className="mt-2 grid gap-1.5 leading-6 text-slate-400">
              <li>Recent player and team form: the last {params.formWindow} completed Gameweek{params.formWindow === 1 ? "" : "s"}.</li>
              <li>Fixture and venue outlook: the next {params.fixtureHorizon} Gameweek{params.fixtureHorizon === 1 ? "" : "s"}.</li>
              <li>Only players with at least {params.minMinutes} minutes in the form window are ranked.</li>
            </ul>
          </section>
          <section>
            <h3 className="font-medium text-slate-100">Normalisation</h3>
            <p className="mt-2 leading-6 text-slate-400">
              Each raw component becomes a 0–100 score using
              {" "}<span className="font-mono text-slate-300">(raw − pool minimum) ÷ (pool maximum − pool minimum) × 100</span>.
              If every raw value is the same, that component is set to 50.
            </p>
          </section>
        </div>

        <div className="grid gap-3 border-t border-white/10 pt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Component definitions</p>
          <div className="grid gap-3 xl:grid-cols-2">
            <FormulaDefinition
              symbol="I"
              title="Individual form"
              formula="(xG + xA) × 0.55 + FPL points × 0.30 + DefCon × position factor × 0.15 + (last-season xGI/90 × 4 + last-season points/90) × 0.25"
              note="DefCon factors: DEF 1.00, MID 0.55, all other positions 0.15."
            />
            <FormulaDefinition
              symbol="T"
              title="Team form"
              formula="team attack × attack factor + team defence × defence factor"
              note="Attack = avg match points + avg goals scored × 0.35 + team xGI × 0.10. Defence = 3 − avg goals conceded + team DefCon × 0.03. GKP/DEF use 0.40 attack + 0.60 defence; MID/FWD use 0.80 + 0.20."
            />
            <FormulaDefinition
              symbol="F"
              title="Fixture outlook"
              formula="average of (6 − FDR) × 20 for every upcoming fixture"
              note="Includes double Gameweeks; a team with no fixture gets a raw score of 0."
            />
            <FormulaDefinition
              symbol="V"
              title="Home / away"
              formula="average of 1 for home fixtures and −1 for away fixtures"
              note="Calculated over the same upcoming-fixture horizon."
            />
          </div>
        </div>

        <p className="border-t border-white/10 pt-4 text-xs leading-5 text-slate-500">
          Position and club filters only change the displayed rows. Component normalisation uses
          the full player pool before those display filters are applied.
        </p>
      </div>
    </details>
  );
}

function FormulaDefinition({
  symbol,
  title,
  formula,
  note,
}: {
  symbol: string;
  title: string;
  formula: string;
  note: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/20 p-3">
      <h3 className="font-medium text-slate-100">
        <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded bg-cyan-300/10 px-1 font-mono text-xs text-cyan-100">
          {symbol}
        </span>
        {title}
      </h3>
      <p className="mt-2 overflow-x-auto font-mono text-xs leading-5 text-slate-300">{formula}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </section>
  );
}
