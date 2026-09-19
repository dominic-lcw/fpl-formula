"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardProvider, useDashboard } from "@/components/dashboard-provider";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { viewFromPathname, viewMeta } from "@/lib/dashboard-nav";
import type { LiveGameweekStatus } from "@/lib/fpl-gameweeks";

function liveGameweekLabel(liveGameweek: LiveGameweekStatus) {
  if (liveGameweek.currentGameweekStatus === "in_progress") {
    return `Live FPL: GW${liveGameweek.currentGameweek} in progress`;
  }
  if (liveGameweek.currentGameweekStatus === "upcoming") {
    return `Live FPL: GW${liveGameweek.currentGameweek} next`;
  }
  return `Live FPL: GW${liveGameweek.currentGameweek} complete`;
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeView = viewFromPathname(pathname);
  const { seasonLabel, liveGameweek } = useDashboard();
  const meta = viewMeta[activeView];

  return (
    <SidebarProvider>
      <AppSidebar
        seasonLabel={seasonLabel}
        liveLabel={liveGameweek ? liveGameweekLabel(liveGameweek) : null}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 hidden h-4 sm:block" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{meta.title}</h1>
            <p className="hidden truncate text-sm text-muted-foreground md:block">{meta.description}</p>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 sm:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </DashboardProvider>
  );
}
