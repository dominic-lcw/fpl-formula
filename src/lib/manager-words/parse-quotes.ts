import { createHash } from "node:crypto";
import type { FplTeamRef } from "./types";
import { teamMatchNames } from "./team-slugs";

export type ParsedManagerQuote = {
  teamName: string | null;
  managerName: string | null;
};

const SKIP_HEADLINE_PATTERNS = [
  /^get involved/i,
  /^goodnight/i,
  /^that's all for today/i,
  /^watch /i,
  /^listen /i,
];

const MANAGER_LINE_PATTERNS = [
  /^(.+?)\s+(?:boss|manager|head coach)\s+(.+?)\s+(?:on|confirmed|says|said|adds|added|also adds|speaking)/i,
  /^(.+?)\s+(?:boss|manager|head coach)\s+(.+?):\s*/i,
  /^(.+?)\s+(?:boss|manager|head coach)\s+(.+?)$/i,
];

export function shouldSkipHeadline(headline: string): boolean {
  return SKIP_HEADLINE_PATTERNS.some((pattern) => pattern.test(headline.trim()));
}

export function looksLikeManagerContent(text: string): boolean {
  return /\b(?:boss|manager|head coach)\b/i.test(text);
}

export function looksLikePressConferencePage(headline: string): boolean {
  return /news conferences?|press conferences?/i.test(headline);
}

export function looksLikePressRssItem(title: string, description: string): boolean {
  const combined = `${title} ${description}`;
  if (looksLikePressConferencePage(combined)) return true;
  return looksLikeManagerContent(combined);
}

export function parseManagerFromText(text: string, teams: FplTeamRef[]): ParsedManagerQuote {
  const normalized = text.replace(/\s+/g, " ").trim();

  for (const pattern of MANAGER_LINE_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const teamFragment = match[1]?.trim() ?? null;
    const managerName = cleanupManagerName(match[2]);
    const team = teamFragment ? matchTeam(teamFragment, teams) : null;

    if (team || managerName) {
      return {
        teamName: team?.name ?? null,
        managerName,
      };
    }
  }

  return {
    teamName: null,
    managerName: null,
  };
}

export function stableItemId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

function cleanupManagerName(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/,\s*on .+$/i, "")
    .replace(/\s+on .+$/i, "")
    .replace(/\s+(?:is|was|has|have|says|said|adds|added|also adds|speaking|previews|previewed|confirmed)\b.+$/i, "")
    .trim();
  return cleaned || null;
}

function matchTeam(text: string, teams: FplTeamRef[]): FplTeamRef | null {
  const lower = text.toLowerCase();

  for (const team of teams) {
    for (const name of teamMatchNames(team)) {
      if (lower.includes(name.toLowerCase())) {
        return team;
      }
    }
  }

  return null;
}
