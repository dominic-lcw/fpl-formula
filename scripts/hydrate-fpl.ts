import type { DuckDBConnection } from "@duckdb/node-api";
import { parse } from "csv-parse/sync";
import { createHydrationConnection, exportParquetDataset, resetReadConnection } from "../src/lib/db";
import { hydrateCurrentSeasonOnConnection, seasonCode, syncCurrentSeasonFromFpl } from "../src/lib/fpl-hydrate";

const LAST_SEASON_ARCHIVE =
  "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/9779cdbc0c07f6c900c2d0c181ddf6bb9c800f88/data";
const currentOnly = process.argv.includes("--current-only");
const positionById: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

type Json = Record<string, unknown>;
let connection: DuckDBConnection;

async function execute(sql: string, values?: (string | number | boolean | null)[]) {
  return connection.run(sql, values);
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "null") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function previousSeasonCode(season = seasonCode()) {
  const startYear = Number(season.slice(0, 4)) - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

async function fetchCsv(url: string): Promise<Json[]> {
  const response = await fetch(url, { headers: { "User-Agent": "fpl-formula-data-hydrator" } });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return parse(await response.text(), { columns: true, skip_empty_lines: true, bom: true }) as Json[];
}

async function upsertPreviousSeasonSummary(season: string, player: Json) {
  const playerCode = number(player.code) ?? number(player.element_code);
  if (!playerCode) return;
  const position = positionById[number(player.element_type) ?? number(player.position) ?? 0] ?? "MID";
  await execute(
    `INSERT OR REPLACE INTO player_season_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

async function hydratePreviousSeasonSummary() {
  const season = previousSeasonCode();
  const players = await fetchCsv(`${LAST_SEASON_ARCHIVE}/${season}/players_raw.csv`);
  for (const player of players) await upsertPreviousSeasonSummary(season, player);
  console.log(`Synced ${season}: ${players.length} player summaries.`);
}

async function main() {
  if (currentOnly) {
    const result = await syncCurrentSeasonFromFpl();
    console.log(`Synced ${result.season}: ${result.records} current-season records.`);
    return;
  }

  connection = await createHydrationConnection();
  try {
    await hydratePreviousSeasonSummary();
    const { season, records } = await hydrateCurrentSeasonOnConnection(connection);
    await exportParquetDataset(connection);
    resetReadConnection();
    console.log(`Synced ${season}: ${records} current-season records.`);
  } finally {
    connection.closeSync();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
