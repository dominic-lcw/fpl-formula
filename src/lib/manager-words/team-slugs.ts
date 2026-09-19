import type { FplTeamRef } from "./types";

/** BBC Sport team RSS slug for each FPL team name. */
const BBC_TEAM_SLUGS: Record<string, string> = {
  Arsenal: "arsenal",
  "Aston Villa": "aston-villa",
  Bournemouth: "afc-bournemouth",
  Brentford: "brentford",
  Brighton: "brighton-and-hove-albion",
  Chelsea: "chelsea",
  "Coventry City": "coventry-city",
  "Crystal Palace": "crystal-palace",
  Everton: "everton",
  Fulham: "fulham",
  "Hull City": "hull-city",
  "Ipswich Town": "ipswich-town",
  Leeds: "leeds-united",
  Liverpool: "liverpool",
  "Man City": "manchester-city",
  "Man Utd": "manchester-united",
  Newcastle: "newcastle-united",
  "Nott'm Forest": "nottingham-forest",
  Spurs: "tottenham-hotspur",
  Sunderland: "sunderland",
};

export function bbcTeamSlug(team: FplTeamRef): string | null {
  return BBC_TEAM_SLUGS[team.name] ?? null;
}

export function bbcTeamRssUrl(team: FplTeamRef): string | null {
  const slug = bbcTeamSlug(team);
  return slug ? `https://feeds.bbci.co.uk/sport/football/teams/${slug}/rss.xml` : null;
}

/** Alternate names used in BBC copy for team matching. */
export function teamMatchNames(team: FplTeamRef): string[] {
  const aliases: Record<string, string[]> = {
    "Man City": ["Manchester City", "Man City"],
    "Man Utd": ["Manchester United", "Man Utd"],
    Spurs: ["Tottenham", "Tottenham Hotspur", "Spurs"],
    "Nott'm Forest": ["Nottingham Forest", "Forest"],
    Newcastle: ["Newcastle United", "Newcastle"],
    Leeds: ["Leeds United", "Leeds"],
    Brighton: ["Brighton", "Brighton and Hove Albion"],
  };

  return [team.name, ...(aliases[team.name] ?? [])];
}
