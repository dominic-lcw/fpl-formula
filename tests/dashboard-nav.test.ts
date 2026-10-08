import { describe, expect, it } from "vitest";
import { dashboardViews, viewFromPathname, viewHref } from "../src/lib/dashboard-nav";

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
});
