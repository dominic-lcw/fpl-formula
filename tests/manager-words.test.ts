import { describe, expect, it } from "vitest";
import { gameweekForDate } from "../src/lib/manager-words/gameweek-mapper";
import {
  looksLikePressConferencePage,
  looksLikePressRssItem,
  parseManagerFromText,
  shouldSkipHeadline,
} from "../src/lib/manager-words/parse-quotes";
import { bbcTeamRssUrl } from "../src/lib/manager-words/team-slugs";

const teams = [
  { id: 6, name: "Chelsea", shortName: "CHE" },
  { id: 14, name: "Liverpool", shortName: "LIV" },
  { id: 16, name: "Man Utd", shortName: "MUN" },
];

const events = [
  { id: 4, name: "Gameweek 4", deadlineTime: "2026-09-12T12:30:00Z", finished: true },
  { id: 5, name: "Gameweek 5", deadlineTime: "2026-09-18T17:30:00Z", finished: false },
  { id: 6, name: "Gameweek 6", deadlineTime: "2026-10-10T10:00:00Z", finished: false },
];

describe("manager words parsing", () => {
  it("maps publication dates into the relevant gameweek window", () => {
    expect(gameweekForDate(new Date("2026-09-17T12:00:00Z"), events)).toBe(5);
    expect(gameweekForDate(new Date("2026-09-11T09:00:00Z"), events)).toBe(4);
  });

  it("detects press conference pages and RSS snippets", () => {
    expect(looksLikePressConferencePage("Premier League news conferences: Carrick speaking")).toBe(true);
    expect(looksLikePressConferencePage("Premier League LIVE: Brentford vs Chelsea - team news")).toBe(false);
    expect(
      looksLikePressRssItem(
        "'Not a catastrophe' - Carrick dismisses Man Utd job fears",
        "Manchester United head coach Michael Carrick says there is no point wasting any time worrying if his job is under threat.",
      ),
    ).toBe(true);
    expect(
      looksLikePressRssItem(
        "Moving from Newcastle to Liverpool easy decision - Isak",
        "Striker Alexander Isak says Liverpool's ambition and determination to sign him was a big part of why he joined the club.",
      ),
    ).toBe(false);
  });

  it("extracts manager and team names from BBC-style copy", () => {
    expect(
      parseManagerFromText(
        "Chelsea boss Liam Rosenior confirmed that Cole Palmer hasn't suffered another groin injury.",
        teams,
      ),
    ).toEqual({
      teamName: "Chelsea",
      managerName: "Liam Rosenior",
    });

    expect(
      parseManagerFromText(
        "Manchester United head coach Michael Carrick says there is no point wasting any time worrying if his job is under threat.",
        teams,
      ),
    ).toEqual({
      teamName: "Man Utd",
      managerName: "Michael Carrick",
    });
  });

  it("skips non-manager live blog posts", () => {
    expect(shouldSkipHeadline("Get Involved - 'Rosenior is in denial'")).toBe(true);
    expect(shouldSkipHeadline("Parker provides Burnley team news")).toBe(false);
  });

  it("builds BBC team RSS URLs from FPL team names", () => {
    expect(bbcTeamRssUrl({ id: 19, name: "Spurs", shortName: "TOT" })).toBe(
      "https://feeds.bbci.co.uk/sport/football/teams/tottenham-hotspur/rss.xml",
    );
  });
});
