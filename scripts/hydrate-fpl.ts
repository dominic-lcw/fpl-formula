import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { closeDatabase, migrateSchema, run } from "../src/lib/db";

const FPL_API = "https://fantasy.premierleague.com/api";
const LAST_SEASON_ARCHIVE =
  "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/9779cdbc0c07f6c900c2d0c181ddf6bb9c800f88/data";
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

function previousSeasonCode(season = seasonCode()) {
  const startYear = Number(season.slice(0, 4)) - 1;
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
  await run(
    `INSERT INTO sync_runs (id, season, source, status, details) VALUES (?, ?, ?, 'running', ?)`,
    [randomUUID(), season, source, "Hydration started"],
  );
}

async function endRun(season: string, source: string, status: "complete" | "failed", records: number, details: string) {
  await run(
    `UPDATE sync_runs SET status = ?, records_loaded = ?, details = ?, completed_at = NOW()
     WHERE season = ? AND source = ? AND status = 'running'
       AND started_at = (SELECT max(started_at) FROM sync_runs WHERE season = ? AND source = ?)`,
    [status, records, details, season, source, season, source],
  );
}

async function upsertTeam(season: string, team: Json) {
  await run(
    `INSERT INTO teams (
      season, team_id, name, short_name,
      strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (season, team_id) DO UPDATE SET
      name = EXCLUDED.name,
      short_name = EXCLUDED.short_name,
      strength_attack_home = EXCLUDED.strength_attack_home,
      strength_attack_away = EXCLUDED.strength_attack_away,
      strength_defence_home = EXCLUDED.strength_defence_home,
      strength_defence_away = EXCLUDED.strength_defence_away`,
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
  await run(
    `INSERT INTO players (
      season, player_id, web_name, first_name, second_name, player_code, team_id, position,
      now_cost, status, chance_of_playing_next_round, selected_by_percent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (season, player_id) DO UPDATE SET
      web_name = EXCLUDED.web_name,
      first_name = EXCLUDED.first_name,
      second_name = EXCLUDED.second_name,
      player_code = EXCLUDED.player_code,
      team_id = EXCLUDED.team_id,
      position = EXCLUDED.position,
      now_cost = EXCLUDED.now_cost,
      status = EXCLUDED.status,
      chance_of_playing_next_round = EXCLUDED.chance_of_playing_next_round,
      selected_by_percent = EXCLUDED.selected_by_percent`,
    [
      season,
      number(player.id) ?? number(player.element) ?? 0,
      text(player.web_name) ?? text(player.name) ?? "Unknown",
      text(player.first_name),
      text(player.second_name),
      number(player.code) ?? number(player.element_code),
      number(player.team),
      position,
      number(player.now_cost),
      text(player.status) ?? "a",
      number(player.chance_of_playing_next_round),
      number(player.selected_by_percent),
    ],
  );
}

async function upsertPreviousSeasonSummary(season: string, player: Json) {
  const playerCode = number(player.code) ?? number(player.element_code);
  if (!playerCode) return;
  const position = positionById[number(player.element_type) ?? number(player.position) ?? 0] ?? "MID";
  await run(
    `INSERT INTO player_season_summaries (
      season, player_code, web_name, position, total_points, minutes,
      expected_goals, expected_assists, defensive_contribution
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (season, player_code) DO UPDATE SET
      web_name = EXCLUDED.web_name,
      position = EXCLUDED.position,
      total_points = EXCLUDED.total_points,
      minutes = EXCLUDED.minutes,
      expected_goals = EXCLUDED.expected_goals,
      expected_assists = EXCLUDED.expected_assists,
      defensive_contribution = EXCLUDED.defensive_contribution`,
    [
      season,
      playerCode,
      text(player.web_name) ?? text(player.name) ?? "Unknown",
      position,
      number(player.total_points),
      number(player.minutes),
      number(player.expected_goals),
      number(player.expected_assists),
      number(player.defensive_contribution),
    ],
  );
}

async function upsertFixture(season: string, fixture: Json) {
  await run(
    `INSERT INTO fixtures (
      season, fixture_id, event, kickoff_time, team_h, team_a, team_h_score, team_a_score,
      team_h_difficulty, team_a_difficulty, finished
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (season, fixture_id) DO UPDATE SET
      event = EXCLUDED.event,
      kickoff_time = EXCLUDED.kickoff_time,
      team_h = EXCLUDED.team_h,
      team_a = EXCLUDED.team_a,
      team_h_score = EXCLUDED.team_h_score,
      team_a_score = EXCLUDED.team_a_score,
      team_h_difficulty = EXCLUDED.team_h_difficulty,
      team_a_difficulty = EXCLUDED.team_a_difficulty,
      finished = EXCLUDED.finished`,
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
  await run(
    `INSERT INTO player_fixture_stats (
      season, player_id, fixture_id, event, opponent_team, was_home, total_points, minutes,
      goals_scored, assists, clean_sheets, goals_conceded, bonus, bps, expected_goals,
      expected_assists, expected_goal_involvements, expected_goals_conceded, defensive_contribution,
      influence, creativity, threat, ict_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (season, player_id, fixture_id) DO UPDATE SET
      event = EXCLUDED.event,
      opponent_team = EXCLUDED.opponent_team,
      was_home = EXCLUDED.was_home,
      total_points = EXCLUDED.total_points,
      minutes = EXCLUDED.minutes,
      goals_scored = EXCLUDED.goals_scored,
      assists = EXCLUDED.assists,
      clean_sheets = EXCLUDED.clean_sheets,
      goals_conceded = EXCLUDED.goals_conceded,
      bonus = EXCLUDED.bonus,
      bps = EXCLUDED.bps,
      expected_goals = EXCLUDED.expected_goals,
      expected_assists = EXCLUDED.expected_assists,
      expected_goal_involvements = EXCLUDED.expected_goal_involvements,
      expected_goals_conceded = EXCLUDED.expected_goals_conceded,
      defensive_contribution = EXCLUDED.defensive_contribution,
      influence = EXCLUDED.influence,
      creativity = EXCLUDED.creativity,
      threat = EXCLUDED.threat,
      ict_index = EXCLUDED.ict_index`,
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
    await run(
      `INSERT INTO seasons (season, source, synced_at) VALUES (?, ?, NOW())
       ON CONFLICT (season) DO UPDATE SET source = EXCLUDED.source, synced_at = EXCLUDED.synced_at`,
      [season, source],
    );
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

async function hydratePreviousSeasonSummary() {
  const season = previousSeasonCode();
  const players = await fetchCsv(`${LAST_SEASON_ARCHIVE}/${season}/players_raw.csv`);
  for (const player of players) await upsertPreviousSeasonSummary(season, player);
  console.log(`Synced ${season}: ${players.length} player summaries.`);
}

async function main() {
  await migrateSchema();
  if (!currentOnly) {
    await hydratePreviousSeasonSummary();
  }
  await hydrateCurrentSeason();
}

main()
  .then(() => closeDatabase())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
