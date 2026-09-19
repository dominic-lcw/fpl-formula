import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { BookingRecord } from "@/lib/booking-settlement";

export const userDataDirectory = process.env.FPL_USER_DATA_DIR
  ?? (process.env.WEBSITE_SITE_NAME ? "/home/fpl-formula" : path.join(process.cwd(), "data", "user"));

export type FixtureResultRecord = {
  season: string;
  fixtureId: number;
  teamHScore: number;
  teamAScore: number;
  resolvedAt: string;
  source: string;
};

type BookingRow = {
  id: string;
  fixture_id: number;
  season: string;
  home_team: string;
  away_team: string;
  market: string;
  selection: string;
  stake: number;
  odds: number;
  expected_home_goals: number;
  expected_away_goals: number;
  model_prob: number;
  expected_value: number;
  notes: string | null;
  booked_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  outcome: string | null;
  pnl: number | null;
  settled_at: string | null;
};

type FixtureResultRow = {
  season: string;
  fixture_id: number;
  team_h_score: number;
  team_a_score: number;
  resolved_at: string;
  source: string;
};

let bookingsCache: BookingRecord[] | undefined;
let fixtureResultsCache: FixtureResultRecord[] | undefined;
let loadPromise: Promise<void> | undefined;

function bookingsFile() {
  return path.join(userDataDirectory, "bookings.json");
}

function fixtureResultsFile() {
  return path.join(userDataDirectory, "fixture-results.json");
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath: string, data: unknown) {
  await mkdir(userDataDirectory, { recursive: true });
  const stagingPath = path.join(tmpdir(), `user-${randomUUID()}.json`);
  try {
    await writeFile(stagingPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await copyFile(stagingPath, filePath);
  } finally {
    await rm(stagingPath, { force: true });
  }
}

function mapBookingRow(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    fixtureId: row.fixture_id,
    season: row.season,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    market: row.market as BookingRecord["market"],
    selection: row.selection,
    stake: Number(row.stake),
    odds: Number(row.odds),
    expectedHomeGoals: Number(row.expected_home_goals),
    expectedAwayGoals: Number(row.expected_away_goals),
    modelProb: Number(row.model_prob),
    expectedValue: Number(row.expected_value),
    notes: row.notes,
    bookedAt: String(row.booked_at),
    status: row.status === "settled" ? "settled" : "open",
    homeScore: row.home_score === null || row.home_score === undefined ? null : Number(row.home_score),
    awayScore: row.away_score === null || row.away_score === undefined ? null : Number(row.away_score),
    outcome: row.outcome === "won" || row.outcome === "lost" ? row.outcome : null,
    pnl: row.pnl === null || row.pnl === undefined ? null : Number(row.pnl),
    settledAt: row.settled_at ? String(row.settled_at) : null,
  };
}

function mapFixtureResultRow(row: FixtureResultRow): FixtureResultRecord {
  return {
    season: row.season,
    fixtureId: row.fixture_id,
    teamHScore: Number(row.team_h_score),
    teamAScore: Number(row.team_a_score),
    resolvedAt: String(row.resolved_at),
    source: row.source,
  };
}

async function readParquetRows<T extends Record<string, unknown>>(filePath: string) {
  const instance = await DuckDBInstance.create();
  const connection = await instance.connect();
  try {
    const escaped = filePath.replaceAll("'", "''");
    const reader = await connection.runAndReadAll(`SELECT * FROM read_parquet('${escaped}')`);
    return reader.getRowObjectsJS() as T[];
  } finally {
    connection.closeSync();
  }
}

async function migrateFromParquetIfNeeded() {
  if (!(await fileExists(bookingsFile())) && await fileExists(path.join(userDataDirectory, "bookings.parquet"))) {
    const rows = await readParquetRows<BookingRow>(path.join(userDataDirectory, "bookings.parquet"));
    bookingsCache = rows.map(mapBookingRow);
    await writeJsonAtomic(bookingsFile(), { version: 1, bookings: bookingsCache });
  }

  if (!(await fileExists(fixtureResultsFile())) && await fileExists(path.join(userDataDirectory, "fixture_results.parquet"))) {
    const rows = await readParquetRows<FixtureResultRow>(path.join(userDataDirectory, "fixture_results.parquet"));
    fixtureResultsCache = rows.map(mapFixtureResultRow);
    await writeJsonAtomic(fixtureResultsFile(), { version: 1, results: fixtureResultsCache });
  }
}

async function loadUserData() {
  if (!loadPromise) {
    loadPromise = (async () => {
      await migrateFromParquetIfNeeded();

      if (await fileExists(bookingsFile())) {
        const payload = JSON.parse(await readFile(bookingsFile(), "utf8")) as { bookings?: BookingRecord[] };
        bookingsCache = payload.bookings ?? [];
      } else {
        bookingsCache = [];
      }

      if (await fileExists(fixtureResultsFile())) {
        const payload = JSON.parse(await readFile(fixtureResultsFile(), "utf8")) as { results?: FixtureResultRecord[] };
        fixtureResultsCache = payload.results ?? [];
      } else {
        fixtureResultsCache = [];
      }
    })();
  }
  await loadPromise;
}

export async function readBookings(): Promise<BookingRecord[]> {
  await loadUserData();
  return [...(bookingsCache ?? [])];
}

export async function writeBookings(bookings: BookingRecord[]) {
  await loadUserData();
  bookingsCache = [...bookings];
  await writeJsonAtomic(bookingsFile(), { version: 1, bookings: bookingsCache });
}

export async function readFixtureResults(): Promise<FixtureResultRecord[]> {
  await loadUserData();
  return [...(fixtureResultsCache ?? [])];
}

export async function writeFixtureResults(results: FixtureResultRecord[]) {
  await loadUserData();
  fixtureResultsCache = [...results];
  await writeJsonAtomic(fixtureResultsFile(), { version: 1, results: fixtureResultsCache });
}

export async function bookedFixtureKeys(season: string) {
  const bookings = await readBookings();
  return new Set(
    bookings
      .filter((booking) => booking.season === season)
      .map((booking) => `${booking.season}:${booking.fixtureId}`),
  );
}

/** Test helper: reset in-memory cache between isolated runs. */
export function resetUserStoreCache() {
  bookingsCache = undefined;
  fixtureResultsCache = undefined;
  loadPromise = undefined;
}
