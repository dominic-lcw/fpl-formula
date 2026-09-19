import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ManagerWordsFetchResult } from "./types";

const managerWordsDirectory =
  process.env.FPL_MANAGER_WORDS_DIR ?? path.join(process.cwd(), "data", "manager-words");

export function managerWordsFilePath() {
  return path.join(managerWordsDirectory, "latest.json");
}

export async function loadManagerWords(): Promise<ManagerWordsFetchResult | null> {
  const filePath = managerWordsFilePath();

  try {
    await stat(filePath);
  } catch {
    return null;
  }

  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as ManagerWordsFetchResult;
}
