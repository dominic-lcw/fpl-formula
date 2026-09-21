import { beforeEach, describe, expect, it } from "vitest";
import { getForecastData, resolveDefaultGameweek } from "../src/lib/match-forecast";
import { resetTestDatabase, run } from "../src/lib/db";

beforeEach(async () => {
  await resetTestDatabase();
});

describe("resolveDefaultGameweek", () => {
  it("defaults to the next gameweek after the latest completed one", () => {
    expect(resolveDefaultGameweek([4, 5, 6], 3)).toBe(4);
    expect(resolveDefaultGameweek([5, 6, 7], 4)).toBe(5);
  });

  it("falls back to the first available gameweek when none are ahead of completed", () => {
    expect(resolveDefaultGameweek([4, 5], 6)).toBe(4);
  });

  it("returns null when there are no upcoming gameweeks", () => {
    expect(resolveDefaultGameweek([], 4)).toBeNull();
  });
});

describe("getForecastData default gameweek", () => {
  it("points at the next upcoming gameweek after hydration", async () => {
    await run(`INSERT INTO sync_runs (id, season, source, status, records_loaded, completed_at) VALUES ('22222222-2222-4222-8222-222222222222', '2025-26', 'official-fpl-api', 'complete', 10, '2025-09-01')`);
    await run(`INSERT INTO teams (season, team_id, name, short_name, strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away) VALUES ('2025-26', 94, 'Brentford', 'BRE', 1100, 1050, 1000, 1050), ('2025-26', 8, 'Chelsea', 'CHE', 1200, 1150, 1100, 1150)`);
    await run(`INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished) VALUES ('2025-26', 1, 1, 94, 8, 1, 1, true), ('2025-26', 2, 2, 8, 94, 2, 0, true), ('2025-26', 3, 3, 94, 8, 0, 2, true), ('2025-26', 4, 4, 8, 94, 1, 1, true), ('2025-26', 5, 5, 94, 8, NULL, NULL, false)`);

    const data = await getForecastData();

    expect(data.season).toBe("2025-26");
    expect(data.currentGameweek).toBe(4);
    expect(data.defaultGameweek).toBe(5);
    expect(data.availableGameweeks).toEqual([5]);
    expect(data.upcomingFixtures).toHaveLength(1);
    expect(data.upcomingFixtures[0]?.fixtureId).toBe(5);
  });
});
