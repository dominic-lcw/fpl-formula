import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

const parquetDirectory = process.env.FPL_PARQUET_DIR ?? path.join(process.cwd(), "data", "parquet");
const dataTables = [
  "seasons",
  "teams",
  "players",
  "player_season_summaries",
  "fixtures",
  "player_fixture_stats",
  "sync_runs",
] as const;
let readConnectionPromise: Promise<DuckDBConnection> | undefined;

const schema = `
  CREATE TABLE IF NOT EXISTS seasons (
    season VARCHAR PRIMARY KEY, source VARCHAR NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT current_timestamp
  );
  CREATE TABLE IF NOT EXISTS teams (
    season VARCHAR NOT NULL, team_id INTEGER NOT NULL, name VARCHAR NOT NULL, short_name VARCHAR,
    strength_attack_home DOUBLE, strength_attack_away DOUBLE, strength_defence_home DOUBLE, strength_defence_away DOUBLE,
    PRIMARY KEY (season, team_id)
  );
  CREATE TABLE IF NOT EXISTS players (
    season VARCHAR NOT NULL, player_id INTEGER NOT NULL, web_name VARCHAR NOT NULL, first_name VARCHAR, second_name VARCHAR,
    player_code INTEGER, team_id INTEGER, position VARCHAR NOT NULL, now_cost DOUBLE, status VARCHAR,
    chance_of_playing_next_round INTEGER, selected_by_percent DOUBLE, PRIMARY KEY (season, player_id)
  );
  CREATE TABLE IF NOT EXISTS player_season_summaries (
    season VARCHAR NOT NULL, player_code INTEGER NOT NULL, web_name VARCHAR NOT NULL, position VARCHAR NOT NULL,
    total_points DOUBLE, minutes DOUBLE, expected_goals DOUBLE, expected_assists DOUBLE, defensive_contribution DOUBLE,
    PRIMARY KEY (season, player_code)
  );
  CREATE TABLE IF NOT EXISTS fixtures (
    season VARCHAR NOT NULL, fixture_id INTEGER NOT NULL, event INTEGER, kickoff_time TIMESTAMP,
    team_h INTEGER NOT NULL, team_a INTEGER NOT NULL, team_h_score INTEGER, team_a_score INTEGER,
    team_h_difficulty INTEGER, team_a_difficulty INTEGER, finished BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (season, fixture_id)
  );
  CREATE TABLE IF NOT EXISTS player_fixture_stats (
    season VARCHAR NOT NULL, player_id INTEGER NOT NULL, fixture_id INTEGER NOT NULL, event INTEGER,
    opponent_team INTEGER, was_home BOOLEAN, total_points DOUBLE, minutes DOUBLE, goals_scored DOUBLE, assists DOUBLE,
    clean_sheets DOUBLE, goals_conceded DOUBLE, bonus DOUBLE, bps DOUBLE, expected_goals DOUBLE, expected_assists DOUBLE,
    expected_goal_involvements DOUBLE, expected_goals_conceded DOUBLE, defensive_contribution DOUBLE, influence DOUBLE,
    creativity DOUBLE, threat DOUBLE, ict_index DOUBLE, PRIMARY KEY (season, player_id, fixture_id)
  );
  CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID DEFAULT uuid(), season VARCHAR NOT NULL, source VARCHAR NOT NULL, status VARCHAR NOT NULL,
    records_loaded INTEGER NOT NULL DEFAULT 0, details VARCHAR, started_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    completed_at TIMESTAMP
  );
`;

async function createMemoryConnection() {
  const instance = await DuckDBInstance.create();
  return instance.connect();
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function datasetFiles() {
  return dataTables.map((table) => path.join(parquetDirectory, `${table}.parquet`));
}

async function hasParquetDataset() {
  return (await Promise.all(datasetFiles().map(fileExists))).every(Boolean);
}

export async function createHydrationConnection() {
  const connection = await createMemoryConnection();
  await connection.run(schema);
  if (await hasParquetDataset()) {
    for (const [index, table] of dataTables.entries()) {
      const filePath = datasetFiles()[index].replaceAll("'", "''");
      await connection.run(`INSERT INTO ${table} SELECT * FROM read_parquet('${filePath}')`);
    }
  }
  return connection;
}

async function loadParquetDataset(connection: DuckDBConnection) {
  const files = datasetFiles();
  if (!(await hasParquetDataset())) {
    await connection.run(schema);
    return;
  }

  for (const [index, table] of dataTables.entries()) {
    const filePath = files[index].replaceAll("'", "''");
    await connection.run(`CREATE TABLE ${table} AS SELECT * FROM read_parquet('${filePath}')`);
  }
}

export async function getConnection() {
  if (!readConnectionPromise) {
    readConnectionPromise = createMemoryConnection().then(async (connection) => {
      await loadParquetDataset(connection);
      return connection;
    });
  }
  return readConnectionPromise;
}

export async function exportParquetDataset(connection: DuckDBConnection) {
  const parentDirectory = path.dirname(parquetDirectory);
  const stagingDirectory = path.join(parentDirectory, `.parquet-staging-${randomUUID()}`);
  await mkdir(stagingDirectory, { recursive: true });
  try {
    for (const table of dataTables) {
      const filePath = path.join(stagingDirectory, `${table}.parquet`).replaceAll("'", "''");
      await connection.run(`COPY ${table} TO '${filePath}' (FORMAT PARQUET, COMPRESSION ZSTD)`);
    }
    await rm(parquetDirectory, { recursive: true, force: true });
    await rename(stagingDirectory, parquetDirectory);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function resetReadConnection() {
  readConnectionPromise = undefined;
}

export async function query<T extends Record<string, unknown>>(
  sql: string,
  values?: (string | number | boolean | null)[],
): Promise<T[]> {
  const connection = await getConnection();
  const reader = await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJS() as T[];
}

export { parquetDirectory };
