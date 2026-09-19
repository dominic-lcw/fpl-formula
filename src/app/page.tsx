import { redirect } from "next/navigation";
import { dashboardRoutes } from "@/lib/dashboard-nav";

export default function Home() {
  redirect(dashboardRoutes.rankings);
}
