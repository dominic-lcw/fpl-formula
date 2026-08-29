import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { databasePath, execute, getConnection } from "../src/lib/db";

const FPL_API = "https://fantasy.premierleague.com/api";
const ARCHIVE_API = "https://api.github.com/repos/vaastav/Fantasy-Premier-League/contents/data";
const ARCHIVE_RAW = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data";
const currentOnly = process.argv.includes("--current-only");
const positionById: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

type Json = Record<string, unknown>;

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "null") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function seasonCode(date = new Date()) {
  const startYear = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "fpl-formula-data-hydrator" },
  });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return response.json() as Promise<T>;
}

async function fetchCsv(url: string): Promise<Json[]> {
  const response = await fetch(url, { headers: { "User-Agent": "fpl-formula-data-hydrator" } });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return parse(await response.text(), { columns: true, skip_empty_lines: true, bom: true }) as Json[];
}

async function mapLimit<T>(items: T[], limit: number, mapper: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await mapper(item);
      }
    }),
  );
}

async function beginRun(season: string, source: string) {
  await execute(
    `INSERT INTO sync_runs (season, source, status, details) VALUES (?, ?, 'running', ?)`,
    [season, source, "Hydration started"],
  );
}

async function endRun(season: string, source: string, status: "complete" | "failed", records: number, details: string) {
  await execute(
    `UPDATE sync_runs SET status = ?, records_loaded = ?, details = ?, completed_at = current_timestamp
     WHERE season = ? AND source = ? AND status = 'running'
       AND started_at = (SELECT max(started_at) FROM sync_runs WHERE season = ? AND source = ?)`,
    [status, records, details, season, source, season, source],
  );
}

async function upsertTeam(season: string, team: Json) {
  await execute(
    `INSERT OR REPLACE INTO teams VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      season,
      number(team.id) ?? 0,
      text(team.name) ?? text(team.short_name) ?? "Unknown",
      text(team.short_name),
      number(team.strength_attack_home),
      number(team.strength_attack_away),
      number(team.strength_defence_home),
      number(team.strength_defence_away),
    ],
  );
}

async function upsertPlayer(season: string, player: Json) {
  const position = positionById[number(player.element_type) ?? number(player.position) ?? 0] ?? "MID";
  await execute(
    `INSERT OR REPLACE INTO players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      season,
      number(player.id) ?? number(player.element) ?? 0,
      text(player.web_name) ?? text(player.name) ?? "Unknown",
      text(player.first_name),
      text(player.second_name),
      number(player.team),
      position,
      number(player.now_cost),
      text(player.status) ?? "a",
      number(player.chance_of_playing_next_round),
      number(player.selected_by_percent),
    ],
  );
}

async function upsertFixture(season: string, fixture: Json) {
  await execute(
    `INSERT OR REPLACE INTO fixtures VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      season,
      number(fixture.id) ?? 0,
      number(fixture.event),
      text(fixture.kickoff_time),
      number(fixture.team_h) ?? 0,
      number(fixture.team_a) ?? 0,
      number(fixture.team_h_score),
      number(fixture.team_a_score),
      number(fixture.team_h_difficulty),
      number(fixture.team_a_difficulty),
      Boolean(fixture.finished),
    ],
  );
}

async function upsertStats(season: string, playerId: number, stat: Json) {
  const fixtureId = number(stat.fixture);
  if (!fixtureId) return;
  await execute(
    `INSERT OR REPLACE INTO player_fixture_stats VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      season,
      playerId,
      fixtureId,
      number(stat.round) ?? number(stat.event),
      number(stat.opponent_team),
      Boolean(stat.was_home),
      number(stat.total_points),
      number(stat.minutes),
      number(stat.goals_scored),
      number(stat.assists),
      number(stat.clean_sheets),
      number(stat.goals_conceded),
      number(stat.bonus),
      number(stat.bps),
      number(stat.expected_goals),
      number(stat.expected_assists),
      number(stat.expected_goal_involvements),
      number(stat.expected_goals_conceded),
      number(stat.defensive_contribution),
      number(stat.influence),
      number(stat.creativity),
      number(stat.threat),
      number(stat.ict_index),
    ],
  );
}

async function hydrateCurrentSeason() {
  const season = seasonCode();
  const source = "official-fpl-api";
  let records = 0;
  await beginRun(season, source);
  try {
    const [bootstrap, fixtures] = await Promise.all([
      fetchJson<{ teams: Json[]; elements: Json[] }>(`${FPL_API}/bootstrap-static/`),
      fetchJson<Json[]>(`${FPL_API}/fixtures/`),
    ]);
    await execute(`INSERT OR REPLACE INTO seasons VALUES (?, ?, current_timestamp)`, [season, source]);
    for (const team of bootstrap.teams) {
      await upsertTeam(season, team);
      records++;
    }
    for (const player of bootstrap.elements) {
      await upsertPlayer(season, player);
      records++;
    }
    for (const fixture of fixtures) {
      await upsertFixture(season, fixture);
      records++;
    }
    await mapLimit(bootstrap.elements, 12, async (player) => {
      const playerId = number(player.id);
      if (!playerId) return;
      const summary = await fetchJson<{ history?: Json[] }>(`${FPL_API}/element-summary/${playerId}/`);
      for (const stat of summary.history ?? []) {
        await upsertStats(season, playerId, stat);
        records++;
      }
    });
    await endRun(season, source, "complete", records, "Official FPL current-season sync");
    console.log(`Synced ${season}: ${records} current-season records.`);
  } catch (error) {
    await endRun(season, source, "failed", records, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function archiveSeasons(): Promise<string[]> {
  const contents = await fetchJson<Array<{ type: string; name: string }>>(ARCHIVE_API);
  return contents
    .filter((entry) => entry.type === "dir" && /^\d{4}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((season) => season < seasonCode())
    .sort();
}

async function loadArchiveFile(season: string, file: string) {
  return fetchCsv(`${ARCHIVE_RAW}/${season}/${file}`);
}

async function hydrateArchiveSeason(season: string) {
  const source = "vaastav-fpl-archive";
  let records = 0;
  await beginRun(season, source);
  try {
    const [teams, players, fixtures] = await Promise.all([
      loadArchiveFile(season, "teams.csv"),
      loadArchiveFile(season, "players_raw.csv"),
      loadArchiveFile(season, "fixtures.csv"),
    ]);
    const stats = await loadArchiveFile(season, "gws/merged_gw.csv").catch(() =>
      loadArchiveFile(season, "gws/merged_gws.csv"),
    );
    await execute(`INSERT OR REPLACE INTO seasons VALUES (?, ?, current_timestamp)`, [season, source]);
    for (const team of teams) {
      await upsertTeam(season, team);
      records++;
    }
    for (const player of players) {
      await upsertPlayer(season, player);
      records++;
    }
    for (const fixture of fixtures) {
      await upsertFixture(season, fixture);
      records++;
    }
    for (const stat of stats) {
      await upsertStats(season, number(stat.element) ?? 0, stat);
      records++;
    }
    await endRun(season, source, "complete", records, "Archived FPL CSV sync");
    console.log(`Synced ${season}: ${records} archive records.`);
  } catch (error) {
    await endRun(season, source, "failed", records, error instanceof Error ? error.message : String(error));
    console.warn(`Skipped ${season}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  await mkdir(path.dirname(databasePath), { recursive: true });
  await getConnection();
  if (!currentOnly) {
    const seasons = await archiveSeasons();
    for (const season of seasons) await hydrateArchiveSeason(season);
  }
  await hydrateCurrentSeason();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
