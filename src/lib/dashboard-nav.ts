export type DashboardView = "rankings" | "team" | "tracker" | "forecast";

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
};

export const dashboardRoutes: Record<DashboardView, string> = {
  rankings: "/rankings",
  team: "/team",
  tracker: "/tracker",
  forecast: "/forecast",
};

export function viewFromPathname(pathname: string): DashboardView {
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/tracker")) return "tracker";
  if (pathname.startsWith("/forecast")) return "forecast";
  return "rankings";
}
