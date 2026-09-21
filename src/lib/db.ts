import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type QueryResultRow } from "pg";

type TestDatabase = {
  query: <T extends QueryResultRow>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<void>;
};

declare global {
  var __fplPgPool: Pool | undefined;
  var __fplPglite: TestDatabase | undefined;
}

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../db/schema.sql");

function toPostgresParams(sql: string, values: unknown[] = []) {
  let index = 0;
  const text = sql.replace(/\?/g, () => `$${++index}`);
  return { text, values };
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const useSsl =
    process.env.PGSSLMODE === "require"
    || /sslmode=require/i.test(connectionString)
    || /\.postgres\.database\.azure\.com/i.test(connectionString);

  return new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: true } : undefined,
    max: 10,
  });
}

export function getPool(): Pool {
  if (!globalThis.__fplPgPool) {
    globalThis.__fplPgPool = createPool();
  }
  return globalThis.__fplPgPool;
}

async function runQuery<T extends QueryResultRow>(
  sql: string,
  values?: (string | number | boolean | null)[],
): Promise<T[]> {
  const { text, values: params } = toPostgresParams(sql, values ?? []);
  if (globalThis.__fplPglite) {
    const result = await globalThis.__fplPglite.query<T>(text, params);
    return result.rows;
  }
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function query<T extends QueryResultRow>(
  sql: string,
  values?: (string | number | boolean | null)[],
): Promise<T[]> {
  return runQuery<T>(sql, values);
}

export async function run(
  sql: string,
  values?: (string | number | boolean | null)[],
): Promise<void> {
  await runQuery(sql, values);
}

export async function migrateSchema() {
  const schema = await readFile(schemaPath, "utf8");
  if (globalThis.__fplPglite) {
    await globalThis.__fplPglite.exec(schema);
    return;
  }
  const client = await getPool().connect();
  try {
    await client.query(schema);
  } finally {
    client.release();
  }
}

export async function setupTestDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  globalThis.__fplPglite = new PGlite() as unknown as TestDatabase;
  await migrateSchema();
}

export async function resetTestDatabase() {
  await run(`
    TRUNCATE TABLE
      player_fixture_stats,
      fixture_results,
      bookings,
      fixtures,
      players,
      player_season_summaries,
      teams,
      sync_runs,
      seasons
    RESTART IDENTITY CASCADE
  `);
}

export async function closeDatabase() {
  if (globalThis.__fplPgPool) {
    await globalThis.__fplPgPool.end();
    globalThis.__fplPgPool = undefined;
  }
  globalThis.__fplPglite = undefined;
}
