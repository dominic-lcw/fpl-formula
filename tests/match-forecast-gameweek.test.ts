import { describe, expect, it } from "vitest";
import { getForecastData, resolveDefaultGameweek } from "../src/lib/match-forecast";

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
    const data = await getForecastData();
    if (!data.season) return;

    expect(data.currentGameweek).toBeGreaterThan(0);
    expect(data.defaultGameweek).toBeGreaterThan(data.currentGameweek ?? 0);
    expect(data.availableGameweeks).toContain(data.defaultGameweek);

    const defaultFixtures = data.upcomingFixtures.filter((fixture) => fixture.event === data.defaultGameweek);
    expect(defaultFixtures.length).toBeGreaterThan(0);
    expect(defaultFixtures.some((fixture) =>
      (fixture.homeShortName === "BRE" && fixture.awayShortName === "CHE")
      || (fixture.homeShortName === "CHE" && fixture.awayShortName === "BRE"),
    )).toBe(data.defaultGameweek === 5);
  });
});
