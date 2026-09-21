import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-forecast-gw-${randomUUID()}`);
process.env.FPL_PARQUET_DIR = testParquetDirectory;

let createHydrationConnection: typeof import("../src/lib/db").createHydrationConnection;
let exportParquetDataset: typeof import("../src/lib/db").exportParquetDataset;
let getForecastData: typeof import("../src/lib/match-forecast").getForecastData;
let resetReadConnection: typeof import("../src/lib/db").resetReadConnection;
let resolveDefaultGameweek: typeof import("../src/lib/match-forecast").resolveDefaultGameweek;

beforeAll(async () => {
  ({ createHydrationConnection, exportParquetDataset, resetReadConnection } = await import("../src/lib/db"));
  ({ getForecastData, resolveDefaultGameweek } = await import("../src/lib/match-forecast"));
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
    resetReadConnection();
    const connection = await createHydrationConnection();
    await connection.run(`
      INSERT INTO sync_runs (season, source, status, records_loaded, completed_at)
      VALUES ('2025-26', 'official-fpl-api', 'complete', 10, '2025-09-01');
      INSERT INTO teams (season, team_id, name, short_name, strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away) VALUES
        ('2025-26', 94, 'Brentford', 'BRE', 1100, 1050, 1000, 1050),
        ('2025-26', 8, 'Chelsea', 'CHE', 1200, 1150, 1100, 1150);
      INSERT INTO fixtures (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, finished) VALUES
        ('2025-26', 1, 1, 94, 8, 1, 1, true),
        ('2025-26', 2, 2, 8, 94, 2, 0, true),
        ('2025-26', 3, 3, 94, 8, 0, 2, true),
        ('2025-26', 4, 4, 8, 94, 1, 1, true),
        ('2025-26', 5, 5, 94, 8, NULL, NULL, false);
    `);
    await exportParquetDataset(connection);
    connection.closeSync();
    resetReadConnection();

    const data = await getForecastData();

    expect(data.season).toBe("2025-26");
    expect(data.currentGameweek).toBe(4);
    expect(data.defaultGameweek).toBe(5);
    expect(data.availableGameweeks).toContain(5);

    const defaultFixtures = data.upcomingFixtures.filter((fixture) => fixture.event === data.defaultGameweek);
    expect(defaultFixtures.length).toBeGreaterThan(0);
    expect(defaultFixtures.some((fixture) =>
      (fixture.homeShortName === "BRE" && fixture.awayShortName === "CHE")
      || (fixture.homeShortName === "CHE" && fixture.awayShortName === "BRE"),
    )).toBe(true);
  });
});
