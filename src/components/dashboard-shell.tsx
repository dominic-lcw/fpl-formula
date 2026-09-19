"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardProvider, useDashboard } from "@/components/dashboard-provider";
import { FormulaTracker } from "@/components/formula-tracker";
import { ManagerNewsPanel } from "@/components/manager-news";
import { MatchForecastPanel } from "@/components/match-forecast";
import { RankingsView } from "@/components/rankings-view";
import { TeamAnalysisPanel } from "@/components/team-analysis";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { viewMeta, type DashboardView } from "@/lib/dashboard-nav";
import type { LiveGameweekStatus } from "@/lib/fpl-gameweeks";
import type { RankingParams } from "@/lib/fpl-types";
import { sanitiseParams } from "@/lib/scoring";

function liveGameweekLabel(liveGameweek: LiveGameweekStatus) {
  if (liveGameweek.currentGameweekStatus === "in_progress") {
    return `Live FPL: GW${liveGameweek.currentGameweek} in progress`;
  }
  if (liveGameweek.currentGameweekStatus === "upcoming") {
    return `Live FPL: GW${liveGameweek.currentGameweek} next`;
  }
  return `Live FPL: GW${liveGameweek.currentGameweek} complete`;
}

function panelClass(activeView: DashboardView, view: DashboardView) {
  return activeView === view ? undefined : "hidden";
}

function DashboardPanels({
  activeView,
  onNavigate,
}: {
  activeView: DashboardView;
  onNavigate: (view: DashboardView) => void;
}) {
  const { params, updateParams, showLiveData, updateLiveData } = useDashboard();
  const [mountedViews, setMountedViews] = useState<Set<DashboardView>>(() => new Set(["rankings"]));

  if (!mountedViews.has(activeView)) {
    setMountedViews((current) => {
      if (current.has(activeView)) return current;
      return new Set([...current, activeView]);
    });
  }

  function applyTrackerParams(nextParams: RankingParams) {
    updateParams(sanitiseParams(nextParams));
    onNavigate("rankings");
  }

  return (
    <>
      <div className={panelClass(activeView, "rankings")} aria-hidden={activeView !== "rankings"}>
        <RankingsView />
      </div>
      {mountedViews.has("team") ? (
        <div className={panelClass(activeView, "team")} aria-hidden={activeView !== "team"}>
          <TeamAnalysisPanel
            params={params}
            showLiveData={showLiveData}
            onShowLiveDataChange={updateLiveData}
          />
        </div>
      ) : null}
      {mountedViews.has("tracker") ? (
        <div className={panelClass(activeView, "tracker")} aria-hidden={activeView !== "tracker"}>
          <FormulaTracker currentParams={params} onApplyParams={applyTrackerParams} />
        </div>
      ) : null}
      {mountedViews.has("forecast") ? (
        <div className={panelClass(activeView, "forecast")} aria-hidden={activeView !== "forecast"}>
          <MatchForecastPanel />
        </div>
      ) : null}
      {mountedViews.has("news") ? (
        <div className={panelClass(activeView, "news")} aria-hidden={activeView !== "news"}>
          <ManagerNewsPanel />
        </div>
      ) : null}
    </>
  );
}

function DashboardLayout() {
  const [activeView, setActiveView] = useState<DashboardView>("rankings");
  const { seasonLabel, liveGameweek } = useDashboard();
  const meta = viewMeta[activeView];

  return (
    <SidebarProvider>
      <AppSidebar
        activeView={activeView}
        onNavigate={setActiveView}
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
          <DashboardPanels activeView={activeView} onNavigate={setActiveView} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function DashboardShell() {
  return (
    <DashboardProvider>
      <DashboardLayout />
    </DashboardProvider>
  );
}
