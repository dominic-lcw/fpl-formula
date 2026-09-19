import { NextResponse } from "next/server";
import { loadManagerWords } from "@/lib/manager-words/load-manager-words";

export async function GET(request: Request) {
  const dataset = await loadManagerWords();
  if (!dataset) {
    return NextResponse.json(
      {
        error: "Manager words dataset not found. Run `pnpm fetch:manager-words` first.",
      },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const gameweekParam = url.searchParams.get("gameweek");
  const teamParam = url.searchParams.get("team");

  let items = dataset.items;

  if (gameweekParam) {
    const gameweek = Number(gameweekParam);
    if (!Number.isFinite(gameweek)) {
      return NextResponse.json({ error: "Invalid gameweek parameter." }, { status: 400 });
    }
    items = items.filter((item) => item.gameweek === gameweek);
  }

  if (teamParam) {
    const needle = teamParam.toLowerCase();
    items = items.filter(
      (item) =>
        item.teamName?.toLowerCase().includes(needle) ||
        item.managerName?.toLowerCase().includes(needle),
    );
  }

  return NextResponse.json({
    season: dataset.season,
    fetchedAt: dataset.fetchedAt,
    sources: dataset.sources,
    count: items.length,
    items,
  });
}
