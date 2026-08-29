import { readFile } from "node:fs/promises";
import path from "node:path";
import { parquetDirectory } from "@/lib/db";

const parquetTables = new Set([
  "teams",
  "players",
  "player_season_summaries",
  "fixtures",
  "player_fixture_stats",
  "sync_runs",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/parquet/[table]">) {
  const { table } = await context.params;

  if (!parquetTables.has(table)) {
    return Response.json({ error: "Unknown Parquet table." }, { status: 404 });
  }

  try {
    const parquet = await readFile(path.join(parquetDirectory, `${table}.parquet`));
    return new Response(parquet, {
      headers: {
        "Content-Type": "application/vnd.apache.parquet",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "FPL data has not been hydrated yet. Run pnpm hydrate and reload this page." },
      { status: 404 },
    );
  }
}
