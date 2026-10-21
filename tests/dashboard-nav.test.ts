import { describe, expect, it } from "vitest";
import { dashboardViews, shouldBootstrapRankings, viewFromPathname, viewHref } from "../src/lib/dashboard-nav";

describe("dashboard routes", () => {
  it("maps each sidebar tab to its own path", () => {
    const hrefs = dashboardViews.map((view) => viewHref[view]);
    expect(new Set(hrefs).size).toBe(dashboardViews.length);

    for (const view of dashboardViews) {
      expect(viewFromPathname(viewHref[view])).toBe(view);
    }
  });

  it("treats the rankings aliases as the rankings tab", () => {
    expect(viewFromPathname("/")).toBe("rankings");
    expect(viewFromPathname("/rankings")).toBe("rankings");
    expect(viewFromPathname("/rankings/")).toBe("rankings");
    expect(viewFromPathname("/team/")).toBe("team");
  });

  it("only bootstraps rankings on the rankings routes", () => {
    expect(shouldBootstrapRankings("/")).toBe(true);
    expect(shouldBootstrapRankings(viewHref.rankings)).toBe(true);
    expect(shouldBootstrapRankings(viewHref.team)).toBe(false);
    expect(shouldBootstrapRankings(viewHref.tracker)).toBe(false);
    expect(shouldBootstrapRankings(viewHref.forecast)).toBe(false);
    expect(shouldBootstrapRankings(viewHref.news)).toBe(false);
  });
});
