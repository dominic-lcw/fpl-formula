import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

const databasePath = process.env.FPL_DB_PATH ?? path.join(process.cwd(), "data", "fpl.duckdb");
let connectionPromise: Promise<DuckDBConnection> | undefined;

const schema = `
  CREATE TABLE IF NOT EXISTS seasons (
    season VARCHAR PRIMARY KEY,
    source VARCHAR NOT NULL,
    synced_at TIMESTAMP NOT NULL DEFAULT current_timestamp
  );

  CREATE TABLE IF NOT EXISTS teams (
    season VARCHAR NOT NULL,
    team_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    short_name VARCHAR,
    strength_attack_home DOUBLE,
    strength_attack_away DOUBLE,
    strength_defence_home DOUBLE,
    strength_defence_away DOUBLE,
    PRIMARY KEY (season, team_id)
  );

  CREATE TABLE IF NOT EXISTS players (
    season VARCHAR NOT NULL,
    player_id INTEGER NOT NULL,
    web_name VARCHAR NOT NULL,
    first_name VARCHAR,
    second_name VARCHAR,
    team_id INTEGER,
    position VARCHAR NOT NULL,
    now_cost DOUBLE,
    status VARCHAR,
    chance_of_playing_next_round INTEGER,
    selected_by_percent DOUBLE,
    PRIMARY KEY (season, player_id)
  );

  CREATE TABLE IF NOT EXISTS fixtures (
    season VARCHAR NOT NULL,
    fixture_id INTEGER NOT NULL,
    event INTEGER,
    kickoff_time TIMESTAMP,
    team_h INTEGER NOT NULL,
    team_a INTEGER NOT NULL,
    team_h_score INTEGER,
    team_a_score INTEGER,
    team_h_difficulty INTEGER,
    team_a_difficulty INTEGER,
    finished BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (season, fixture_id)
  );

  CREATE TABLE IF NOT EXISTS player_fixture_stats (
    season VARCHAR NOT NULL,
    player_id INTEGER NOT NULL,
    fixture_id INTEGER NOT NULL,
    event INTEGER,
    opponent_team INTEGER,
    was_home BOOLEAN,
    total_points DOUBLE,
    minutes DOUBLE,
    goals_scored DOUBLE,
    assists DOUBLE,
    clean_sheets DOUBLE,
    goals_conceded DOUBLE,
    bonus DOUBLE,
    bps DOUBLE,
    expected_goals DOUBLE,
    expected_assists DOUBLE,
    expected_goal_involvements DOUBLE,
    expected_goals_conceded DOUBLE,
    defensive_contribution DOUBLE,
    influence DOUBLE,
    creativity DOUBLE,
    threat DOUBLE,
    ict_index DOUBLE,
    PRIMARY KEY (season, player_id, fixture_id)
  );

  CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID DEFAULT uuid(),
    season VARCHAR NOT NULL,
    source VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    records_loaded INTEGER NOT NULL DEFAULT 0,
    details VARCHAR,
    started_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    completed_at TIMESTAMP
  );
`;

export async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = DuckDBInstance.create(databasePath).then((instance) => instance.connect());
  }
  const connection = await connectionPromise;
  await connection.run(schema);
  return connection;
}

export async function execute(sql: string, values?: (string | number | boolean | null)[]) {
  const connection = await getConnection();
  return connection.run(sql, values);
}

export async function query<T extends Record<string, unknown>>(
  sql: string,
  values?: (string | number | boolean | null)[],
): Promise<T[]> {
  const connection = await getConnection();
  const reader = await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJS() as T[];
}

export { databasePath };
