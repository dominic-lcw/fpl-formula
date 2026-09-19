import { describe, expect, it } from "vitest";
import {
  dashboardRoutes,
  shouldBootstrapRankings,
  viewFromPathname,
} from "@/lib/dashboard-nav";

describe("dashboard navigation helpers", () => {
  it("maps each dashboard route to the correct view", () => {
    expect(viewFromPathname("/rankings")).toBe("rankings");
    expect(viewFromPathname("/team")).toBe("team");
    expect(viewFromPathname("/tracker")).toBe("tracker");
    expect(viewFromPathname("/forecast")).toBe("forecast");
    expect(viewFromPathname("/news")).toBe("news");
  });

  it("does not treat tracker as team", () => {
    expect(viewFromPathname("/tracker")).toBe("tracker");
    expect(viewFromPathname("/tracker")).not.toBe("team");
  });

  it("normalizes trailing slashes", () => {
    expect(viewFromPathname("/forecast/")).toBe("forecast");
    expect(viewFromPathname("/team/")).toBe("team");
  });

  it("only bootstraps rankings on the rankings route", () => {
    expect(shouldBootstrapRankings(dashboardRoutes.rankings)).toBe(true);
    expect(shouldBootstrapRankings(dashboardRoutes.team)).toBe(false);
    expect(shouldBootstrapRankings(dashboardRoutes.tracker)).toBe(false);
    expect(shouldBootstrapRankings(dashboardRoutes.forecast)).toBe(false);
    expect(shouldBootstrapRankings(dashboardRoutes.news)).toBe(false);
  });
});
