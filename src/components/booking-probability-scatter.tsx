"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameweekSlateRow } from "@/lib/gameweek-slate";

type ScatterPoint = {
  id: number;
  label: string;
  modelProb: number;
  impliedProb: number;
};

const plotWidth = 520;
const plotHeight = 280;
const margin = { top: 16, right: 16, bottom: 44, left: 52 };
const innerWidth = plotWidth - margin.left - margin.right;
const innerHeight = plotHeight - margin.top - margin.bottom;

function formatAxisPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function buildPoints(rows: GameweekSlateRow[]): ScatterPoint[] {
  return rows.flatMap((row) => {
    const booking = row.booking;
    if (!booking || booking.odds <= 1) return [];
    return [{
      id: row.fixtureId,
      label: `${row.homeShortName} vs ${row.awayShortName}`,
      modelProb: booking.modelProb,
      impliedProb: 1 / booking.odds,
    }];
  });
}

export function BookingProbabilityScatter({ rows }: { rows: GameweekSlateRow[] }) {
  const points = useMemo(() => buildPoints(rows), [rows]);
  const [activePointId, setActivePointId] = useState<number | null>(null);

  if (points.length === 0) return null;

  const values = points.flatMap((point) => [point.modelProb, point.impliedProb]);
  const padding = 0.05;
  const minProb = Math.max(0, Math.min(...values) - padding);
  const maxProb = Math.min(1, Math.max(...values) + padding);
  const range = maxProb - minProb || 0.1;
  const scaleX = (value: number) => margin.left + ((value - minProb) / range) * innerWidth;
  const scaleY = (value: number) => margin.top + innerHeight - ((value - minProb) / range) * innerHeight;
  const ticks = [minProb, (minProb + maxProb) / 2, maxProb];
  const activePoint = points.find((point) => point.id === activePointId) ?? null;

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Model vs implied probability</CardTitle>
        <p className="text-sm text-muted-foreground">
          Booked selections only. Implied probability is 1 / decimal odds. Points above the diagonal suggest positive expected value.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${plotWidth} ${plotHeight}`}
            className="mx-auto w-full max-w-[520px]"
            role="img"
            aria-label="Scatter plot comparing model probability against implied probability for booked selections"
          >
            {ticks.map((tick) => (
              <g key={`grid-${tick}`}>
                <line
                  x1={scaleX(tick)}
                  y1={margin.top}
                  x2={scaleX(tick)}
                  y2={margin.top + innerHeight}
                  className="stroke-border/70"
                  strokeDasharray="4 4"
                />
                <line
                  x1={margin.left}
                  y1={scaleY(tick)}
                  x2={margin.left + innerWidth}
                  y2={scaleY(tick)}
                  className="stroke-border/70"
                  strokeDasharray="4 4"
                />
                <text x={scaleX(tick)} y={plotHeight - 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {formatAxisPercent(tick)}
                </text>
                <text x={14} y={scaleY(tick) + 3} textAnchor="start" className="fill-muted-foreground text-[10px]">
                  {formatAxisPercent(tick)}
                </text>
              </g>
            ))}

            <line
              x1={scaleX(minProb)}
              y1={scaleY(minProb)}
              x2={scaleX(maxProb)}
              y2={scaleY(maxProb)}
              className="stroke-muted-foreground/50"
              strokeWidth={1.5}
            />

            {points.map((point) => (
              <g key={point.id}>
                <circle
                  cx={scaleX(point.impliedProb)}
                  cy={scaleY(point.modelProb)}
                  r={activePointId === point.id ? 6 : 5}
                  className="fill-primary stroke-background stroke-2"
                  onMouseEnter={() => setActivePointId(point.id)}
                  onMouseLeave={() => setActivePointId((current) => (current === point.id ? null : current))}
                  onFocus={() => setActivePointId(point.id)}
                  onBlur={() => setActivePointId((current) => (current === point.id ? null : current))}
                  tabIndex={0}
                  aria-label={`${point.label}: model ${formatAxisPercent(point.modelProb)}, implied ${formatAxisPercent(point.impliedProb)}`}
                />
              </g>
            ))}

            <text x={margin.left + innerWidth / 2} y={plotHeight - 2} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
              Implied probability
            </text>
            <text
              x={16}
              y={margin.top + innerHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90 16 ${margin.top + innerHeight / 2})`}
              className="fill-foreground text-[11px] font-medium"
            >
              Model probability
            </text>
          </svg>
        </div>
        {activePoint ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{activePoint.label}</span>
            {" · "}
            model {formatAxisPercent(activePoint.modelProb)}
            {" · "}
            implied {formatAxisPercent(activePoint.impliedProb)}
          </p>
        ) : (
          <p className="mt-3 text-center text-sm text-muted-foreground">Hover a point to see the match.</p>
        )}
      </CardContent>
    </Card>
  );
}
