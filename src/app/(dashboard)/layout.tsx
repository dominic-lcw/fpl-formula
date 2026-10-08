import { DashboardShell } from "@/components/dashboard-shell";

export default function DashboardRoutesLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
