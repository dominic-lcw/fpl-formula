# FPL Formula Lab

An explainable Fantasy Premier League player-ranking dashboard. It only uses FPL-provided statistics and FPL fixture difficulty: individual form (points, xG, xA, defensive contribution and minutes), team form, future fixtures, and home/away context.

## Start

```bash
pnpm install
pnpm hydrate          # previous-season summaries, then the live season
pnpm dev
```

Open `http://localhost:3000`. Re-run `pnpm hydrate:current` after a Gameweek to refresh current-season data. The app reads its local DuckDB file from `data/fpl.duckdb`; override that location with `FPL_DB_PATH`.

## Data sources

- **Live season:** the public official FPL API: `bootstrap-static`, `fixtures`, and one `element-summary` response per player. The hydration script imports every available player match record from Gameweek 1 to the latest response plus future fixtures.
- **Previous-season reference:** [Vaastav's Fantasy Premier League archive](https://github.com/vaastav/Fantasy-Premier-League), pinned to the immediately preceding season's player summary CSV.

The official FPL API is current-season only. The app intentionally does not import older match-level archives: it uses the previous season's player totals as a reference while current-season samples are small. The official API remains the authority for live data.

## Formula

Default total score:

```text
45% individual form + 20% team form + 25% fixture outlook + 10% home/away
```

Each component is normalized against the eligible player pool (0–100), so the table represents a relative expected ranking rather than projected FPL points.

- **Individual:** rolling xG + xA, FPL points, defensive contribution (position-aware), a previous-season per-90 reference, and a minutes eligibility threshold.
- **Team:** recent FPL match points/goals plus player xG/xA and defensive-contribution aggregates.
- **Fixtures:** next 3 Gameweeks’ FPL fixture difficulty, including doubles and blanks.
- **Venue:** the home/away balance in that same fixture horizon.

Use the dashboard controls to change the rolling window, horizon, minutes threshold, and all weights. Applied settings are saved locally in the browser.

## Commands

```bash
pnpm hydrate          # previous-season player summaries + current season
pnpm hydrate:current  # current season only
pnpm test
pnpm lint
pnpm build
```

For routine updates, schedule `pnpm hydrate:current` after each FPL Gameweek completes. The previous-season summary refresh is idempotent and runs only with `pnpm hydrate`.
