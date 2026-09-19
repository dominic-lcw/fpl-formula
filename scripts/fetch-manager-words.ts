import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchManagerWords } from "../src/lib/manager-words/fetch-manager-words";

const outputDirectory = process.env.FPL_MANAGER_WORDS_DIR ?? path.join(process.cwd(), "data", "manager-words");

async function main() {
  const result = await fetchManagerWords();
  await mkdir(outputDirectory, { recursive: true });

  const outputPath = path.join(outputDirectory, "latest.json");
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const byGameweek = new Map<number, number>();
  for (const item of result.items) {
    if (item.gameweek == null) continue;
    byGameweek.set(item.gameweek, (byGameweek.get(item.gameweek) ?? 0) + 1);
  }

  console.log(`Saved ${result.items.length} manager press items to ${outputPath}`);
  console.log(`Season: ${result.season}`);
  console.log(`Sources: ${result.sources.rssArticles} RSS snippets, ${result.sources.livePages} live pages, ${result.sources.liveUpdates} live updates`);
  console.log("Items by gameweek:", Object.fromEntries([...byGameweek.entries()].sort(([a], [b]) => a - b)));

  const sample = result.items.slice(0, 3);
  if (sample.length) {
    console.log("\nSample items:");
    for (const item of sample) {
      console.log(`- GW${item.gameweek ?? "?"} ${item.teamName ?? "Unknown"} (${item.managerName ?? "manager unknown"}): ${item.headline}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
