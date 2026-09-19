export type DashboardView = "rankings" | "team" | "tracker" | "forecast" | "news";

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
    description: "Fixture cards with predicted winners and likely scorelines — click a card for the top 3 simulated scores. Book from the Bookings tab.",
  },
  news: {
    title: "Manager news",
    description: "Pre-match manager quotes by gameweek and club. Review the fetched BBC press data before we wire it into rankings.",
  },
};

export const dashboardRoutes: Record<DashboardView, string> = {
  rankings: "/rankings",
  team: "/team",
  tracker: "/tracker",
  forecast: "/forecast",
  news: "/news",
};

export function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function viewFromPathname(pathname: string): DashboardView {
  const normalized = normalizePathname(pathname);
  for (const [view, route] of Object.entries(dashboardRoutes) as Array<[DashboardView, string]>) {
    if (normalized === route || normalized.startsWith(`${route}/`)) {
      return view;
    }
  }
  return "rankings";
}

export function shouldBootstrapRankings(pathname: string) {
  return viewFromPathname(pathname) === "rankings";
}
