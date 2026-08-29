# FPL Formula Lab

An explainable Fantasy Premier League player-ranking dashboard. It only uses FPL-provided statistics and FPL fixture difficulty: individual form (points, xG, xA, defensive contribution and minutes), team form, future fixtures, and home/away context.

## Start

```bash
pnpm install
pnpm hydrate          # archived seasons, then the live season
pnpm dev
```

Open `http://localhost:3000`. Re-run `pnpm hydrate:current` after a Gameweek to refresh current-season data. The app reads its local DuckDB file from `data/fpl.duckdb`; override that location with `FPL_DB_PATH`.

## Data sources

- **Live season:** the public official FPL API: `bootstrap-static`, `fixtures`, and one `element-summary` response per player. The hydration script imports every available player match record from Gameweek 1 to the latest response plus future fixtures.
- **Historical seasons:** [Vaastav's Fantasy Premier League archive](https://github.com/vaastav/Fantasy-Premier-League), imported season by season where its CSVs are available.

The official FPL API is current-season only. Historic fields vary by season, especially newer measures such as xG/xA and defensive contribution; the importer stores unavailable measures as `NULL` rather than estimating them. The archive stopped weekly updates after 2024/25, so the official API is always the authority for current-season refreshes.

## Formula

Default total score:

```text
45% individual form + 20% team form + 25% fixture outlook + 10% home/away
```

Each component is normalized against the eligible player pool (0–100), so the table represents a relative expected ranking rather than projected FPL points.

- **Individual:** rolling xG + xA, FPL points, defensive contribution (position-aware), and a minutes eligibility threshold.
- **Team:** recent FPL match points/goals plus player xG/xA and defensive-contribution aggregates.
- **Fixtures:** next 3 Gameweeks’ FPL fixture difficulty, including doubles and blanks.
- **Venue:** the home/away balance in that same fixture horizon.

Use the dashboard controls to change the rolling window, horizon, minutes threshold, and all weights. Applied settings are saved locally in the browser.

## Commands

```bash
pnpm hydrate          # all archived seasons + current season
pnpm hydrate:current  # current season only
pnpm test
pnpm lint
pnpm build
```

For routine updates, schedule `pnpm hydrate:current` after each FPL Gameweek completes. Historical refreshes are idempotent, but are generally only needed when the archive changes.
