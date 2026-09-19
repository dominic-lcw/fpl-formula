import { readFile, stat } from "node:fs/promises";
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

function parquetEtag(mtimeMs: number, size: number) {
  return `"${mtimeMs.toString(36)}-${size.toString(36)}"`;
}

export async function GET(request: Request, context: RouteContext<"/api/parquet/[table]">) {
  const { table } = await context.params;

  if (!parquetTables.has(table)) {
    return Response.json({ error: "Unknown Parquet table." }, { status: 404 });
  }

  const cacheHeaders = {
    "Cache-Control": "public, max-age=3600",
  };

  try {
    const filePath = path.join(parquetDirectory, `${table}.parquet`);
    const info = await stat(filePath);
    const etag = parquetEtag(info.mtimeMs, info.size);

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ...cacheHeaders,
          ETag: etag,
        },
      });
    }

    const parquet = await readFile(filePath);
    return new Response(parquet, {
      headers: {
        ...cacheHeaders,
        "Content-Type": "application/vnd.apache.parquet",
        ETag: etag,
      },
    });
  } catch {
    return Response.json(
      { error: "FPL data has not been hydrated yet. Run pnpm hydrate and reload this page." },
      { status: 404 },
    );
  }
}
