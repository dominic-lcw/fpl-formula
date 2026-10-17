export const dashboardViews = ["rankings", "team", "tracker", "forecast", "news"] as const;

export type DashboardView = (typeof dashboardViews)[number];

export const viewHref: Record<DashboardView, string> = {
  rankings: "/",
  team: "/team",
  tracker: "/tracker",
  forecast: "/forecast",
  news: "/news",
};

const viewByPath: Record<string, DashboardView> = {
  ...Object.fromEntries(dashboardViews.map((view) => [viewHref[view], view])),
  "/rankings": "rankings",
};

function normalisePathname(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function forecastFixtureIdFromPathname(pathname: string) {
  const match = /^\/forecast\/(\d+)$/.exec(normalisePathname(pathname));
  if (!match) return null;
  const fixtureId = Number(match[1]);
  return Number.isInteger(fixtureId) && fixtureId > 0 ? fixtureId : null;
}

export function isForecastMatchPath(pathname: string) {
  return /^\/forecast\/[^/]+$/.test(normalisePathname(pathname));
}

export function viewFromPathname(pathname: string): DashboardView {
  const path = normalisePathname(pathname);
  if (path === "/forecast" || isForecastMatchPath(path)) return "forecast";
  return viewByPath[path] ?? "rankings";
}

export const viewMeta: Record<DashboardView, { title: string; description: string }> = {
  rankings: {
    title: "Player rankings, explained.",
    description: "FPL-only scores built from individual form, team form, and fixtures with home advantage included.",
  },
  team: {
    title: "My FPL team",
    description: "Save your public entry ID and compare your squad with the current formula.",
  },
  tracker: {
    title: "Formula tracker",
    description: "Backtest strategies from GW1, then apply any result to Rankings.",
  },
  forecast: {
    title: "Match forecast",
    description: "Fixture cards with predicted winners and likely scorelines. Save a matchday HTML sheet with the forecast, the bet, and booked odds.",
  },
  news: {
    title: "Manager news",
    description: "Pre-match manager quotes by gameweek and club. Review the fetched BBC press data before we wire it into rankings.",
  },
};
