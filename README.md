# FPL Formula Lab

An explainable Fantasy Premier League player-ranking dashboard. It only uses FPL-provided statistics and FPL fixture difficulty: individual form (points, xG, xA, attack contribution, defensive contribution, and minutes), team form, and future fixtures with home advantage included.

## Start

```bash
pnpm install
pnpm hydrate          # previous-season summaries, then the live season
pnpm dev
```

Open `http://localhost:3000`. Re-run `pnpm hydrate:current` after a Gameweek to refresh current-season data. Hydration writes a normalized Parquet dataset to `data/parquet/`; the app loads those files into an in-memory DuckDB instance on startup. Override the dataset location with `FPL_PARQUET_DIR`.

Match bookings are stored apart from that dataset, in `data/user/` locally. Override the location with `FPL_USER_DATA_DIR`. On App Service the path is `/home/fpl-formula`, on the persistent disk, because the deployed package at `wwwroot` is read-only. A booking stays open until the fixture result is hydrated; profit and loss is then settled from the final score.

## Data sources

- **Live season:** the public official FPL API: `bootstrap-static`, `fixtures`, and one `element-summary` response per player. The hydration script imports every available player match record from Gameweek 1 to the latest response plus future fixtures.
- **Previous-season reference:** [Vaastav's Fantasy Premier League archive](https://github.com/vaastav/Fantasy-Premier-League), pinned to the immediately preceding season's player summary CSV.

The official FPL API is current-season only. The app intentionally does not import older match-level archives: it uses the previous season's player totals as a reference while current-season samples are small. The official API remains the authority for live data.

## Formula

Default total score:

```text
45% individual form + 20% team form + 35% fixture outlook
```

Individual form and team form are normalized against the eligible player pool (0–100). Fixture outlook uses a fixed difficulty scale and a minutes factor, so the table stays a relative ranking without letting one club's schedule occupy the full 0–100 range.

- **Individual:** rolling xG + xA, FPL points (including official bonus from BPS), attack contribution (threat + creativity), defensive contribution, a previous-season per-90 reference, and a minutes eligibility threshold.
- **Team:** recent FPL match points/goals plus player xG/xA, attack-contribution, and defensive-contribution aggregates.
- **Fixtures:** the next Gameweeks’ FPL fixture difficulty on a fixed scale (an FDR 5 away game scores 0, an FDR 2 home game scores 100), with home advantage of +0.5 FDR and away of −0.5. Blanks add nothing and doubles count both matches. The score is then multiplied by minutes in the form window, with full credit at 60 minutes per Gameweek, so unused squad players do not inherit the club’s run.

Choose from Balanced, Form first, Fixture led, or Steady presets, or tune the rolling window, horizon, minutes threshold, and weights directly. Rankings recalculate and settings save locally in the browser as each control changes.

## Commands

```bash
pnpm hydrate          # previous-season player summaries + current season
pnpm hydrate:current  # current season only
pnpm fetch:manager-words  # BBC manager press quotes for the Manager news page
pnpm test
pnpm lint
pnpm build
```

For routine updates, schedule `pnpm hydrate:current` after each FPL Gameweek completes. The previous-season summary refresh is idempotent and runs only with `pnpm hydrate`. Restart the app process after hydration so its in-memory DuckDB query layer reloads the new Parquet dataset.

Manager news is fetched separately from BBC Sport RSS feeds and written to `data/manager-words/latest.json`. Override the location with `FPL_MANAGER_WORDS_DIR`. Production deploys run `pnpm fetch:manager-words` after hydration so the Manager news page is populated on startup.
